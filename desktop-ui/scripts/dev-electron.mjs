import { spawn } from 'node:child_process';
import electron from 'electron';

const rendererUrl = 'http://127.0.0.1:5173';
const deadline = Date.now() + 30_000;

while (Date.now() < deadline) {
  try {
    const response = await fetch(rendererUrl);
    if (response.ok) break;
  } catch {
    // Vite is still starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
});

child.on('exit', (code) => process.exit(code ?? 0));
