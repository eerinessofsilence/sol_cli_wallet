import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from solders.keypair import Keypair

import desktop_backend
from utils.logger import redact_secrets


class JsonRequest:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


class DesktopTransactionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        desktop_backend.STATE.previews.clear()
        desktop_backend.STATE.activity.clear()
        desktop_backend.STATE.pending_transactions.clear()
        desktop_backend.STATE.rpc_network_cache.clear()

    def tearDown(self):
        desktop_backend.STATE.previews.clear()
        desktop_backend.STATE.activity.clear()
        desktop_backend.STATE.pending_transactions.clear()
        desktop_backend.STATE.rpc_network_cache.clear()

    def test_mainnet_is_detected_from_genesis_hash_for_custom_rpc(self):
        self.assertEqual(
            desktop_backend._network_name(
                "https://private-provider.example/rpc",
                desktop_backend.MAINNET_GENESIS_HASH,
            ),
            "Mainnet",
        )

    async def test_rpc_probe_returns_detected_network(self):
        class RpcClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get_version(self):
                return SimpleNamespace(value="2.2.0")

            async def get_genesis_hash(self):
                return SimpleNamespace(value=desktop_backend.MAINNET_GENESIS_HASH)

        url = "https://private-provider.example/rpc"
        with patch.object(desktop_backend, "AsyncClient", return_value=RpcClient()):
            result = await desktop_backend._probe_rpc(url)

        self.assertEqual(result["network"], "Mainnet")
        self.assertEqual(
            result["genesis_hash"], desktop_backend.MAINNET_GENESIS_HASH
        )
        self.assertEqual(desktop_backend.STATE.rpc_network_cache[url], "Mainnet")

    async def test_rpc_is_not_saved_when_probe_fails(self):
        with patch.object(
            desktop_backend,
            "_probe_rpc",
            side_effect=RuntimeError("connection refused"),
        ), patch.object(desktop_backend, "set_key") as set_key:
            response = await desktop_backend.rpc_save_handler(
                JsonRequest({"url": "https://unavailable.example/rpc"})
            )

        self.assertEqual(response.status, 502)
        set_key.assert_not_called()

    def test_logger_redacts_labeled_private_keys(self):
        secret = "5aqVynkACsPypbMvTWT41xbTqqfFBT7qcc53771vodsnQpAo"
        message = (
            f"{{'name': 'wallet', 'privkey': '{secret}'}} "
            f'private_key="{secret}" seed=[1, 2, 3]'
        )

        redacted = redact_secrets(message)

        self.assertNotIn(secret, redacted)
        self.assertNotIn("[1, 2, 3]", redacted)
        self.assertEqual(redacted.count("[REDACTED]"), 3)

    async def test_expired_preview_returns_structured_error(self):
        response = await desktop_backend.transaction_send_handler(
            JsonRequest({"preview_id": "missing"})
        )
        payload = json.loads(response.text)

        self.assertEqual(response.status, 400)
        self.assertEqual(payload["code"], "preview_expired")

    async def test_empty_wallet_file_can_be_created_and_selected(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            with patch.object(desktop_backend, "DATA_DIR", data_dir), patch.object(
                desktop_backend, "set_key"
            ) as set_key:
                create_response = await desktop_backend.wallet_file_create_handler(
                    JsonRequest({"name": "trading"})
                )
                select_response = await desktop_backend.wallet_file_select_handler(
                    JsonRequest({"name": "trading.csv"})
                )

        self.assertEqual(create_response.status, 200)
        self.assertEqual(select_response.status, 200)
        self.assertEqual(json.loads(create_response.text)["wallet_file"], "trading.csv")
        self.assertEqual(set_key.call_count, 2)

    async def test_wallet_file_create_rejects_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            (data_dir / "wallets.csv").write_text(
                "name,pubkey,privkey\n", encoding="utf-8"
            )
            with patch.object(desktop_backend, "DATA_DIR", data_dir), patch.object(
                desktop_backend, "set_key"
            ) as set_key:
                response = await desktop_backend.wallet_file_create_handler(
                    JsonRequest({"name": "wallets"})
                )

        self.assertEqual(response.status, 400)
        self.assertIn("уже существует", json.loads(response.text)["error"])
        set_key.assert_not_called()

    def test_legacy_log_dates_are_inferred_across_day_boundaries(self):
        lines = [
            "[•] 20:08:47 | Transaction created successfully.",
            "[•] 16:56:17 | Transaction confirmed.",
            "[•] 12:16:22 | Total balance of all wallets: 0.042056 SOL",
        ]
        modified_at = datetime(2026, 7, 19, 17, 6, 0).timestamp()

        timestamps = desktop_backend._infer_cli_log_timestamps(lines, modified_at)

        self.assertEqual(timestamps[0], "2026-07-17T20:08:47")
        self.assertEqual(timestamps[1], "2026-07-18T16:56:17")
        self.assertEqual(timestamps[2], "2026-07-19T12:16:22")

    def test_cli_log_parser_preserves_explicit_date(self):
        entry = desktop_backend._parse_cli_log_line(
            "[•] 2026-07-19 16:56:17 | Transaction confirmed.",
            0,
        )

        self.assertIsNotNone(entry)
        self.assertEqual(entry["timestamp"], "2026-07-19T16:56:17")

    async def test_batch_continues_and_builds_retry_preview(self):
        sender_keypair = Keypair()
        sender = desktop_backend.Wallet(
            id="sender",
            name="Sender",
            pubkey=str(sender_keypair.pubkey()),
            privkey=str(sender_keypair),
        )
        successful_recipient = str(Keypair().pubkey())
        failed_recipient = str(Keypair().pubkey())
        transfers = [
            desktop_backend._make_transfer(
                sender, successful_recipient, "Successful", 1_000_000
            ),
            desktop_backend._make_transfer(
                sender, failed_recipient, "Failed", 2_000_000
            ),
        ]
        preview_id = "preview"
        desktop_backend.STATE.previews[preview_id] = desktop_backend.Preview(
            created_at=desktop_backend.time.time(),
            rpc_url=desktop_backend.rpc_url(),
            wallet_file=desktop_backend.wallet_file_name(),
            mode="distribute",
            transfers=transfers,
        )
        signature = str(sender_keypair.sign_message(b"submitted"))

        async def submit(_, __, recipient, ___):
            if str(recipient) == failed_recipient:
                raise RuntimeError("test rejection")
            return signature

        with patch.object(
            desktop_backend, "_get_wallet_map", return_value=({"sender": sender}, [])
        ), patch.object(
            desktop_backend, "_submit_transfer", side_effect=submit
        ), patch.object(
            desktop_backend.logger, "success"
        ), patch.object(
            desktop_backend.logger, "exception"
        ):
            response = await desktop_backend.transaction_send_handler(
                JsonRequest({"preview_id": preview_id})
            )

        payload = json.loads(response.text)
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["planned"], 2)
        self.assertEqual(payload["submitted"], 1)
        self.assertEqual(payload["failed"], 1)
        self.assertEqual(
            [item["status"] for item in payload["results"]],
            ["submitted", "failed"],
        )
        self.assertEqual(payload["retry_preview"]["transfer_count"], 1)
        self.assertIn(signature, desktop_backend.STATE.pending_transactions)

    def test_external_mainnet_preview_requires_acknowledgement(self):
        sender_keypair = Keypair()
        sender = desktop_backend.Wallet(
            id="sender",
            name="Sender",
            pubkey=str(sender_keypair.pubkey()),
            privkey=str(sender_keypair),
        )
        preview = desktop_backend.Preview(
            created_at=desktop_backend.time.time(),
            rpc_url="https://api.mainnet-beta.solana.com",
            wallet_file="wallets.csv",
            mode="single",
            transfers=[
                desktop_backend._make_transfer(
                    sender, str(Keypair().pubkey()), "External", 1_000_000
                )
            ],
        )

        with patch.object(desktop_backend, "load_wallets", return_value=([sender], [])):
            payload = desktop_backend._public_preview("preview", preview)

        self.assertTrue(payload["requires_acknowledgement"])
        self.assertEqual(
            [warning["code"] for warning in payload["warnings"]],
            ["external-recipient", "mainnet"],
        )

    async def test_pending_transaction_becomes_finalized(self):
        signature = str(Keypair().sign_message(b"finalized"))
        entry = {
            "id": signature,
            "title": "Sender → Recipient",
            "message": "Отправлено в сеть · 0.001000000 SOL",
            "tone": "info",
            "status": "submitted",
        }
        desktop_backend.STATE.pending_transactions[signature] = {
            "entry": entry,
            "rpc_url": "https://api.mainnet-beta.solana.com",
            "amount": 0.001,
        }

        class RpcClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get_signature_statuses(self, *_args, **_kwargs):
                return SimpleNamespace(
                    value=[
                        SimpleNamespace(
                            err=None,
                            confirmation_status="finalized",
                        )
                    ]
                )

        with patch.object(desktop_backend, "AsyncClient", return_value=RpcClient()):
            await desktop_backend._refresh_pending_transactions()

        self.assertEqual(entry["status"], "finalized")
        self.assertEqual(entry["tone"], "success")
        self.assertNotIn(signature, desktop_backend.STATE.pending_transactions)


if __name__ == "__main__":
    unittest.main()
