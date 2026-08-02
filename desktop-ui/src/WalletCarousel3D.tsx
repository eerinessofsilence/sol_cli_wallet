import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { ChevronLeft, ChevronRight, Send, WalletCards } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WalletRow } from './types';

const walletModelUrl = `${import.meta.env.BASE_URL}wallet.glb`;
const balanceFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
});

type WalletPalette = {
  accent: string;
  card: string;
  detail: string;
  edge: string;
  primary: string;
};

const palettes: WalletPalette[] = [
  {
    accent: '#fff2e8',
    card: '#f4d9c6',
    detail: '#b94517',
    edge: '#f4ae83',
    primary: '#e7652d',
  },
  {
    accent: '#f3efff',
    card: '#ded4ff',
    detail: '#6540c6',
    edge: '#b6a3f4',
    primary: '#8b5cf6',
  },
  {
    accent: '#fff6df',
    card: '#eed8a7',
    detail: '#8c5c16',
    edge: '#d9af65',
    primary: '#b87824',
  },
  {
    accent: '#f2f0eb',
    card: '#d8d4ca',
    detail: '#625c4d',
    edge: '#aaa496',
    primary: '#7c7564',
  },
  {
    accent: '#fbece8',
    card: '#e8beb4',
    detail: '#8f3429',
    edge: '#d58d7e',
    primary: '#b94b3a',
  },
];

const materialColors: Record<keyof WalletPalette, string> = {
  accent: 'WalletAccent',
  card: 'CardSurface',
  detail: 'CardDetail',
  edge: 'WalletEdge',
  primary: 'WalletPrimary',
};

type CarouselMaterial = THREE.MeshStandardMaterial & {
  userData: {
    activeColor?: THREE.Color;
    activeMetalness?: number;
    activeRoughness?: number;
    mutedColor?: THREE.Color;
  };
};

function formatWalletName(wallet: WalletRow) {
  return /^[0-9]+$/.test(wallet.name) ? `Wallet ${wallet.name}` : wallet.name;
}

function formatWalletAddress(wallet: WalletRow) {
  const address = wallet.pubkey || wallet.short_address;
  return address.length > 19 ? `${address.slice(0, 8)}…${address.slice(-8)}` : address;
}

function desaturate(color: THREE.Color) {
  const hsl = { h: 0, l: 0, s: 0 };
  color.getHSL(hsl);
  return new THREE.Color().setHSL(
    hsl.h,
    Math.min(hsl.s * 0.12, 0.08),
    Math.min(0.76, hsl.l * 0.72 + 0.18),
  );
}

function cloneWallet(source: THREE.Object3D, palette: WalletPalette) {
  const scene = source.clone(true);
  const materials: CarouselMaterial[] = [];
  const colorsByMaterial = Object.fromEntries(
    Object.entries(materialColors).map(([paletteKey, materialName]) => [
      materialName,
      palette[paletteKey as keyof WalletPalette],
    ]),
  );

  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;

    child.castShadow = true;
    child.receiveShadow = true;
    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const clonedMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone() as CarouselMaterial;
      const paletteColor = colorsByMaterial[material.name];
      if (paletteColor) material.color.set(paletteColor);
      material.userData.activeColor = material.color.clone();
      material.userData.mutedColor = desaturate(material.color);
      material.userData.activeMetalness = material.metalness;
      material.userData.activeRoughness = material.roughness;
      materials.push(material);
      return material;
    });
    child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
  });

  return { materials, scene };
}

function WalletModel({
  activeIndex,
  index,
  palette,
  onSelect,
}: {
  activeIndex: number;
  index: number;
  palette: WalletPalette;
  onSelect: (index: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const gltf = useLoader(GLTFLoader, walletModelUrl) as GLTF;
  const { materials, scene } = useMemo(
    () => cloneWallet(gltf.scene, palette),
    [gltf.scene, palette],
  );
  const initialDistance = index - activeIndex;
  const initialSelected = initialDistance === 0;
  const motionRef = useRef({
    activeIndex,
    elapsed: 1.1,
    fromPosition: new THREE.Vector3(
      initialDistance * 2.25,
      initialSelected ? 0.1 : -0.14,
      initialSelected ? 0.66 : -0.62 - Math.max(Math.abs(initialDistance) - 1, 0) * 0.26,
    ),
    fromRotationY: initialSelected ? -0.08 : initialDistance < 0 ? 0.46 : -0.46,
    fromRotationZ: initialSelected ? -0.015 : initialDistance < 0 ? 0.065 : -0.065,
    fromScale: initialSelected ? 1.12 : Math.abs(initialDistance) === 1 ? 0.7 : 0.54,
    targetVisible: Math.abs(initialDistance) <= 1,
    wasVisible: Math.abs(initialDistance) <= 1,
  });

  useEffect(
    () => () => {
      materials.forEach((material) => material.dispose());
    },
    [materials],
  );

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const motion = motionRef.current;
    if (motion.activeIndex !== activeIndex) {
      motion.activeIndex = activeIndex;
      motion.elapsed = 0;
      motion.fromPosition.copy(group.position);
      motion.fromRotationY = group.rotation.y;
      motion.fromRotationZ = group.rotation.z;
      motion.fromScale = group.scale.x;
      motion.wasVisible = group.visible;
      motion.targetVisible = Math.abs(index - activeIndex) <= 1;
      if (motion.targetVisible) group.visible = true;
    }

    const distance = index - activeIndex;
    const selected = distance === 0;
    const absoluteDistance = Math.abs(distance);
    const targetScale = selected ? 1.12 : absoluteDistance === 1 ? 0.7 : 0.54;
    const targetX = distance * 2.25;
    const targetY = selected ? 0.1 + Math.sin(clock.elapsedTime * 1.35) * 0.025 : -0.14;
    const targetZ = selected ? 0.66 : -0.62 - Math.max(absoluteDistance - 1, 0) * 0.26;
    const targetRotationY = selected ? -0.08 : distance < 0 ? 0.46 : -0.46;
    const targetRotationZ = selected ? -0.015 : distance < 0 ? 0.065 : -0.065;
    const motionDuration = 1.1;
    const materialDamping = 3.2;
    motion.elapsed = Math.min(motionDuration, motion.elapsed + delta);
    const motionProgress = THREE.MathUtils.smootherstep(motion.elapsed, 0, motionDuration);

    group.visible = motion.targetVisible || (motion.wasVisible && motion.elapsed < motionDuration);
    group.position.x = THREE.MathUtils.lerp(motion.fromPosition.x, targetX, motionProgress);
    group.position.y = THREE.MathUtils.lerp(motion.fromPosition.y, targetY, motionProgress);
    group.position.z = THREE.MathUtils.lerp(motion.fromPosition.z, targetZ, motionProgress);
    group.rotation.y = THREE.MathUtils.lerp(motion.fromRotationY, targetRotationY, motionProgress);
    group.rotation.z = THREE.MathUtils.lerp(motion.fromRotationZ, targetRotationZ, motionProgress);
    const scale = THREE.MathUtils.lerp(motion.fromScale, targetScale, motionProgress);
    group.scale.setScalar(scale);

    materials.forEach((material) => {
      const targetColor = selected ? material.userData.activeColor : material.userData.mutedColor;
      if (targetColor) material.color.lerp(targetColor, 1 - Math.exp(-materialDamping * delta));
      material.roughness = THREE.MathUtils.damp(
        material.roughness,
        selected ? (material.userData.activeRoughness ?? 0.28) : 0.62,
        materialDamping,
        delta,
      );
      material.metalness = THREE.MathUtils.damp(
        material.metalness,
        selected ? (material.userData.activeMetalness ?? 0) : 0,
        materialDamping,
        delta,
      );
    });
  });

  return (
    <group
      ref={groupRef}
      position={[
        initialDistance * 2.25,
        initialSelected ? 0.1 : -0.14,
        initialSelected ? 0.66 : -0.62,
      ]}
      rotation={[
        0,
        initialSelected ? -0.08 : initialDistance < 0 ? 0.46 : -0.46,
        initialSelected ? -0.015 : initialDistance < 0 ? 0.065 : -0.065,
      ]}
      scale={initialSelected ? 1.12 : Math.abs(initialDistance) === 1 ? 0.7 : 0.54}
      visible={Math.abs(initialDistance) <= 1}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(index);
      }}
      onPointerOver={() => {
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <primitive object={scene} />
    </group>
  );
}

function WalletScene({
  activeIndex,
  count,
  onSelect,
}: {
  activeIndex: number;
  count: number;
  onSelect: (index: number) => void;
}) {
  return (
    <>
      <ambientLight intensity={1.7} />
      <hemisphereLight args={['#fff7ef', '#7a5f50', 2.15]} />
      <directionalLight
        castShadow
        intensity={3.8}
        position={[3.5, 4.6, 6.4]}
        shadow-bias={-0.00045}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
      <directionalLight intensity={1.55} position={[-4, 1.8, 3.2]} />

      <group position={[0, 0.22, 0]}>
        {Array.from({ length: count }, (_, index) => (
          <WalletModel
            activeIndex={activeIndex}
            index={index}
            key={index}
            onSelect={onSelect}
            palette={palettes[index % palettes.length]}
          />
        ))}

        <mesh position={[0, -1.12, -0.25]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9, 4]} />
          <shadowMaterial opacity={0.24} transparent />
        </mesh>
      </group>
    </>
  );
}

export function WalletCarousel3D({
  wallets,
  onManage,
  onTransfer,
}: {
  wallets: WalletRow[];
  onManage: () => void;
  onTransfer: (walletId: string) => void;
}) {
  const carouselWallets = useMemo(
    () => [...wallets].sort((a, b) => b.balance - a.balance).slice(0, 5),
    [wallets],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const pointerStart = useRef<number | null>(null);
  const activeWallet = carouselWallets[activeIndex];
  const activePalette = palettes[activeIndex % palettes.length];

  useEffect(() => {
    if (activeIndex >= carouselWallets.length) setActiveIndex(0);
  }, [activeIndex, carouselWallets.length]);

  const selectIndex = useCallback(
    (index: number) => {
      if (!carouselWallets.length) return;
      const nextIndex = Math.max(0, Math.min(carouselWallets.length - 1, index));
      if (nextIndex === activeIndex) return;
      setTransitionDirection(nextIndex > activeIndex ? 'forward' : 'backward');
      setActiveIndex(nextIndex);
    },
    [activeIndex, carouselWallets.length],
  );

  const finishPointerGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (distance <= -42) selectIndex(activeIndex + 1);
    if (distance >= 42) selectIndex(activeIndex - 1);
  };

  if (!activeWallet || !activePalette) return null;

  return (
    <section
      aria-label="Wallet carousel"
      className="relative overflow-hidden rounded-[22px] border border-line bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') selectIndex(activeIndex - 1);
        if (event.key === 'ArrowRight') selectIndex(activeIndex + 1);
      }}
    >
      <div
        className="wallet-carousel-glow pointer-events-none absolute inset-0 opacity-65"
        key={activeWallet.id}
        style={{
          backgroundImage: `radial-gradient(circle at 50% 47%, ${activePalette.primary}2b 0, transparent 34%)`,
        }}
      />
      <div className="relative z-10 flex items-center justify-between gap-4 border-b border-line-soft px-5 py-4 max-[760px]:flex-col max-[760px]:items-stretch">
        <h2 className="m-0 text-[18px] font-extrabold tracking-[-0.02em] text-ink">
          Select an active wallet
        </h2>
        <button
          className="inline-flex min-h-11 min-w-32 cursor-pointer items-center gap-3 rounded-[18px] border border-line bg-raised px-5 py-2 text-sm font-bold tracking-[0.04em] text-copy uppercase transition hover:border-line-strong hover:bg-muted"
          type="button"
          onClick={onManage}
        >
          <WalletCards size={16} />
          Manage wallets
        </button>
      </div>

      <div
        className="relative h-[360px] touch-pan-y select-none max-[680px]:h-[320px]"
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('button')) return;
          pointerStart.current = event.clientX;
        }}
        onPointerLeave={() => {
          pointerStart.current = null;
        }}
        onPointerUp={finishPointerGesture}
      >
        <Canvas
          camera={{ far: 40, fov: 31, near: 0.1, position: [0, 0, 7.2] }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
          shadows
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <Suspense fallback={null}>
            <WalletScene
              activeIndex={activeIndex}
              count={carouselWallets.length}
              onSelect={selectIndex}
            />
          </Suspense>
        </Canvas>

        <button
          aria-label="Previous wallet"
          className="wallet-carousel-arrow wallet-carousel-arrow--previous absolute top-1/2 left-3 z-20 inline-flex h-16 w-16 cursor-pointer items-center justify-center border-0 bg-transparent text-ink disabled:cursor-default disabled:opacity-25"
          disabled={activeIndex === 0}
          type="button"
          onClick={() => selectIndex(activeIndex - 1)}
        >
          <ChevronLeft size={40} strokeWidth={2.25} />
        </button>
        <button
          aria-label="Next wallet"
          className="wallet-carousel-arrow wallet-carousel-arrow--next absolute top-1/2 right-3 z-20 inline-flex h-16 w-16 cursor-pointer items-center justify-center border-0 bg-transparent text-ink disabled:cursor-default disabled:opacity-25"
          disabled={activeIndex === carouselWallets.length - 1}
          type="button"
          onClick={() => selectIndex(activeIndex + 1)}
        >
          <ChevronRight size={40} strokeWidth={2.25} />
        </button>

        <div className="wallet-carousel-copy pointer-events-none absolute right-0 bottom-0 left-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 bg-gradient-to-t from-surface via-surface/80 to-transparent px-5 pt-16 pb-4 max-[760px]:grid-cols-[minmax(0,1fr)_auto]">
          <div className="col-start-1 row-start-1 min-w-0">
            <div className="overflow-hidden">
              <strong
                className={`wallet-carousel-value wallet-carousel-value--${transitionDirection} wallet-carousel-value--name block truncate text-[16px] font-bold text-ink`}
                key={`name-${activeWallet.id}`}
              >
                {formatWalletName(activeWallet)}
              </strong>
            </div>
            <div className="mt-1.5 overflow-hidden">
              <code
                className={`wallet-carousel-value wallet-carousel-value--${transitionDirection} wallet-carousel-value--address block truncate font-mono text-[12px] text-faint`}
                key={`address-${activeWallet.id}`}
                title={activeWallet.pubkey}
              >
                {formatWalletAddress(activeWallet)}
              </code>
            </div>
          </div>
          <div className="liquid-glass-bar pointer-events-auto col-start-2 row-start-1 justify-self-center rounded-[16px] px-4 py-2 max-[760px]:col-span-2 max-[760px]:col-start-1 max-[760px]:row-start-2">
            <div className="flex items-center gap-2">
              {carouselWallets.map((wallet, index) => (
                <button
                  aria-label={`Select ${formatWalletName(wallet)}`}
                  aria-pressed={index === activeIndex}
                  className={`relative z-10 h-1.5 cursor-pointer rounded-full border-0 p-0 transition-all duration-700 ease-in-out ${
                    index === activeIndex ? 'w-7' : 'w-1.5 bg-line hover:bg-line-strong'
                  }`}
                  key={wallet.id}
                  style={
                    index === activeIndex ? { backgroundColor: activePalette.primary } : undefined
                  }
                  type="button"
                  onClick={() => selectIndex(index)}
                />
              ))}
              <span className="relative z-10 ml-2 text-xs font-semibold text-copy tabular-nums">
                {String(activeIndex + 1).padStart(2, '0')} /{' '}
                {String(carouselWallets.length).padStart(2, '0')}
              </span>
            </div>
          </div>
          <div className="pointer-events-auto col-start-3 row-start-1 flex shrink-0 items-center gap-3 justify-self-end max-[760px]:col-start-2">
            <div className="text-right">
              <strong className="block text-[18px] font-bold text-ink tabular-nums">
                <span className="inline-block overflow-hidden align-bottom">
                  <span
                    className={`wallet-carousel-value wallet-carousel-value--${transitionDirection} wallet-carousel-value--balance inline-block`}
                    key={activeWallet.id}
                  >
                    {balanceFormatter.format(activeWallet.balance)}
                  </span>
                </span>{' '}
                SOL
              </strong>
              <span className="text-[12px] tracking-[0.08em] text-faint uppercase">
                Available balance
              </span>
            </div>
            <button
              className="inline-flex min-h-11 min-w-32 cursor-pointer items-center gap-3 rounded-[18px] border border-primary bg-primary px-5 py-2 text-sm font-bold tracking-[0.04em] text-surface uppercase transition hover:border-primary-strong hover:bg-primary-strong"
              type="button"
              onClick={() => onTransfer(activeWallet.id)}
            >
              <Send size={15} />
              Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

useLoader.preload(GLTFLoader, walletModelUrl);
