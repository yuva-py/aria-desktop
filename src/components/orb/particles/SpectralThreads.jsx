// SpectralThreads.jsx
// Spectral light rays using PointsMaterial + vertex colors.
//
// Each thread is 20 points along a line from the orb surface outward.
// Colors follow the visible spectrum: red (base) → violet (tip).
// A perpendicular sine-wave shimmer animates each thread.
// Spawn and despawn via opacity animation.

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE   from 'three';

// ── Constants ─────────────────────────────────────────────────────────────────
const POINTS_PER_THREAD  = 20;
const ORB_SURFACE_RADIUS = 1.2;
const MAX_RADIUS         = 3.5;
const SPAWN_DURATION     = 0.35;
const DESPAWN_DURATION   = 0.40;

// ── Thread directions ─────────────────────────────────────────────────────────
const BASE_DIRS = [
  new THREE.Vector3( 1.0,  0.5,  0.3).normalize(),
  new THREE.Vector3(-0.8,  0.7,  0.2).normalize(),
  new THREE.Vector3( 0.3, -1.0,  0.4).normalize(),
  new THREE.Vector3(-0.5, -0.6,  0.8).normalize(),
];

const TOOL_DIRECTIONS = {
  browser_tool: new THREE.Vector3( 1.0,  0.4,  0.0).normalize(),
  file_tool:    new THREE.Vector3(-1.0, -1.0,  0.0).normalize(),
  system_tool:  new THREE.Vector3( 0.0,  1.0,  0.0).normalize(),
  code_tool:    new THREE.Vector3( 1.0, -0.7,  0.0).normalize(),
};

// ── Spectral gradient ─────────────────────────────────────────────────────────
const SPECTRUM_STOPS = [
  [1.0, 0.00, 0.00],
  [1.0, 0.50, 0.00],
  [1.0, 1.00, 0.00],
  [0.0, 1.00, 0.30],
  [0.0, 0.30, 1.00],
  [0.6, 0.00, 1.00],
];

function spectrumColor(t) {
  const s   = t * (SPECTRUM_STOPS.length - 1);
  const idx = Math.floor(s);
  const f   = s - idx;
  const a   = SPECTRUM_STOPS[Math.min(idx,     SPECTRUM_STOPS.length - 1)];
  const b   = SPECTRUM_STOPS[Math.min(idx + 1, SPECTRUM_STOPS.length - 1)];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}

// ── Single thread ─────────────────────────────────────────────────────────────
function SpectralThread({ direction, phase, onDespawned }) {
  const pointsRef = useRef();
  const timeRef   = useRef(0);
  const stateRef  = useRef({ mode: 'spawning', elapsed: 0, opacity: 0 });

  const perp = useMemo(() => {
    const p = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    if (p.lengthSq() < 0.001)
      p.crossVectors(direction, new THREE.Vector3(1, 0, 0));
    return p.normalize();
  }, [direction]);

  const basePositions = useMemo(() => {
    const start = direction.clone().multiplyScalar(ORB_SURFACE_RADIUS);
    const len   = MAX_RADIUS - ORB_SURFACE_RADIUS;
    const arr   = [];
    for (let i = 0; i < POINTS_PER_THREAD; i++) {
      const t = i / (POINTS_PER_THREAD - 1);
      arr.push(start.clone().addScaledVector(direction, t * len));
    }
    return arr;
  }, [direction]);

  const geometry = useMemo(() => {
    const posArr = new Float32Array(POINTS_PER_THREAD * 3);
    const colArr = new Float32Array(POINTS_PER_THREAD * 3);

    for (let i = 0; i < POINTS_PER_THREAD; i++) {
      const bp = basePositions[i];
      posArr[i*3]   = bp.x;
      posArr[i*3+1] = bp.y;
      posArr[i*3+2] = bp.z;

      const [r, g, b] = spectrumColor(i / (POINTS_PER_THREAD - 1));
      colArr[i*3]   = r;
      colArr[i*3+1] = g;
      colArr[i*3+2] = b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));
    return geo;
  }, [basePositions]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    if (phase !== 'executing') {
      const s = stateRef.current;
      if (s.mode !== 'despawning') { s.mode = 'despawning'; s.elapsed = 0; }
    }
  }, [phase]);

  useFrame((_, dt) => {
    timeRef.current += dt;
    const s   = stateRef.current;
    const pts = pointsRef.current;

    s.elapsed += dt;

    if (s.mode === 'spawning') {
      s.opacity = Math.min(s.elapsed / SPAWN_DURATION, 1.0);
      if (s.opacity >= 1.0) { s.mode = 'holding'; s.elapsed = 0; }
    } else if (s.mode === 'despawning') {
      s.opacity = Math.max(1.0 - s.elapsed / DESPAWN_DURATION, 0.0);
      if (s.opacity <= 0.0) { onDespawned(); return; }
    }

    if (!pts) return;

    const posAttr = pts.geometry.attributes.position;
    const t       = timeRef.current;

    for (let i = 0; i < POINTS_PER_THREAD; i++) {
      const bp   = basePositions[i];
      const wave = Math.sin(t * 3.0 + i * 0.5) * 0.1;
      posAttr.setXYZ(i,
        bp.x + perp.x * wave,
        bp.y + perp.y * wave,
        bp.z + perp.z * wave,
      );
    }
    posAttr.needsUpdate  = true;
    pts.material.opacity = s.opacity;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={4}
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation={false}
      />
    </points>
  );
}

// ── Spawn manager ─────────────────────────────────────────────────────────────
export default function SpectralThreads({ phase, currentTool }) {
  const [threads, setThreads] = useState([]);
  const idRef        = useRef(0);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const wasExec = prevPhaseRef.current === 'executing';
    const isExec  = phase === 'executing';

    if (!wasExec && isExec) {
      const toolDir = TOOL_DIRECTIONS[currentTool] ?? null;

      const newThreads = BASE_DIRS.map((baseDir) => {
        const dir = baseDir.clone();
        if (toolDir) dir.lerp(toolDir, 0.35);
        dir.x += (Math.random() - 0.5) * 0.25;
        dir.y += (Math.random() - 0.5) * 0.25;
        dir.z += (Math.random() - 0.5) * 0.25;
        dir.normalize();
        return { id: idRef.current++, direction: dir };
      });

      setThreads(prev => [...prev, ...newThreads]);
    }

    prevPhaseRef.current = phase;
  }, [phase, currentTool]);

  const removeThread = (id) =>
    setThreads(prev => prev.filter(t => t.id !== id));

  if (threads.length === 0) return null;

  return (
    <group>
      {threads.map(t => (
        <SpectralThread
          key={t.id}
          direction={t.direction}
          phase={phase}
          onDespawned={() => removeThread(t.id)}
        />
      ))}
    </group>
  );
}
