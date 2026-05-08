// src/components/orb/SpectralRays.jsx
// Obsidian-mode-only spectral light rays converging toward the orb center.
//
// Rendered as 8 Points-based beams arranged on a sphere around the orb.
// Each beam has a vertex-color gradient: violet (outer tip) → red (inner tip,
// near orb surface). Additive blending makes them blaze against dark
// backgrounds. Crystal mode renders nothing.
//
// The whole group slowly rotates around the Y axis for a subtle cinematic
// drift. A faint per-point oscillation gives them shimmer.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useSettingsStore from '../../store/settingsStore';

// ── Constants ─────────────────────────────────────────────────────────────────
const NUM_RAYS       = 8;
const POINTS_PER_RAY = 18;
const INNER_RADIUS   = 1.15;   // ray's near tip (just outside the orb)
const OUTER_RADIUS   = 4.2;    // ray's far tip
const POINT_SIZE     = 3;      // pixels (sizeAttenuation:false)

// ── Spectral gradient (red → violet) ──────────────────────────────────────────
// t=0 is the inner tip (closest to orb, red), t=1 is outer tip (violet).
const SPECTRUM = [
  [1.0, 0.05, 0.05],  // red
  [1.0, 0.45, 0.05],  // orange
  [1.0, 0.95, 0.10],  // yellow
  [0.10, 1.00, 0.30], // green
  [0.10, 0.30, 1.00], // blue
  [0.55, 0.05, 1.00], // violet
];

function spectrumColor(t) {
  const s   = t * (SPECTRUM.length - 1);
  const idx = Math.floor(s);
  const f   = s - idx;
  const a   = SPECTRUM[Math.min(idx,     SPECTRUM.length - 1)];
  const b   = SPECTRUM[Math.min(idx + 1, SPECTRUM.length - 1)];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}

// ── Ray geometry builder ──────────────────────────────────────────────────────
function buildRayGeometry(direction) {
  const positions = new Float32Array(POINTS_PER_RAY * 3);
  const colors    = new Float32Array(POINTS_PER_RAY * 3);

  for (let i = 0; i < POINTS_PER_RAY; i++) {
    const t = i / (POINTS_PER_RAY - 1);
    // i=0: inner tip near orb surface; i=last: outer tip
    const r = INNER_RADIUS + t * (OUTER_RADIUS - INNER_RADIUS);
    positions[i*3]     = direction.x * r;
    positions[i*3 + 1] = direction.y * r;
    positions[i*3 + 2] = direction.z * r;

    const [cr, cg, cb] = spectrumColor(t);
    colors[i*3]        = cr;
    colors[i*3 + 1]    = cg;
    colors[i*3 + 2]    = cb;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
  return geo;
}

// ── Single ray ────────────────────────────────────────────────────────────────
function SingleRay({ direction, basePositions }) {
  const pointsRef = useRef();
  const elapsed   = useRef(Math.random() * 10); // de-sync between rays

  // Perpendicular axis used for the shimmer oscillation
  const perp = useMemo(() => {
    const p = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
    if (p.lengthSq() < 0.001) p.crossVectors(direction, new THREE.Vector3(1, 0, 0));
    return p.normalize();
  }, [direction]);

  const geometry = useMemo(() => buildRayGeometry(direction), [direction]);

  useFrame((_, dt) => {
    const pts = pointsRef.current;
    if (!pts) return;
    elapsed.current += dt;
    const t = elapsed.current;

    const posAttr = pts.geometry.attributes.position;
    for (let i = 0; i < POINTS_PER_RAY; i++) {
      const bp   = basePositions[i];
      const wave = Math.sin(t * 2.2 + i * 0.4) * 0.04;
      posAttr.setXYZ(
        i,
        bp.x + perp.x * wave,
        bp.y + perp.y * wave,
        bp.z + perp.z * wave,
      );
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={POINT_SIZE}
        vertexColors
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation={false}
      />
    </points>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SpectralRays() {
  const theme    = useSettingsStore((s) => s.theme);
  const groupRef = useRef();

  // Pre-compute ray directions + base positions once.
  // Rays are deterministically distributed in azimuth + slight elevation jitter.
  const rays = useMemo(() => {
    const out = [];
    for (let i = 0; i < NUM_RAYS; i++) {
      // Even azimuth around the Y axis with a tiny phase offset per ray
      const az    = (i / NUM_RAYS) * Math.PI * 2 + 0.13;
      // Modest elevation variation: alternating + sin wave for natural feel
      const el    = Math.sin(i * 1.7) * 0.55;
      const dir   = new THREE.Vector3(
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el),
      ).normalize();

      // Base positions for shimmer reference
      const base = [];
      for (let j = 0; j < POINTS_PER_RAY; j++) {
        const t = j / (POINTS_PER_RAY - 1);
        const r = INNER_RADIUS + t * (OUTER_RADIUS - INNER_RADIUS);
        base.push(new THREE.Vector3(dir.x * r, dir.y * r, dir.z * r));
      }

      out.push({ id: i, direction: dir, base });
    }
    return out;
  }, []);

  // Slow group rotation for cinematic drift
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();
    groupRef.current.rotation.y =  t * 0.04;
    groupRef.current.rotation.x =  Math.sin(t * 0.07) * 0.05;
  });

  // Crystal mode → render nothing (just the pure glass orb)
  if (theme !== 'obsidian') return null;

  return (
    <group ref={groupRef}>
      {rays.map((ray) => (
        <SingleRay
          key={ray.id}
          direction={ray.direction}
          basePositions={ray.base}
        />
      ))}
    </group>
  );
}
