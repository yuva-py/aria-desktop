// src/components/orb/ScanLine.jsx
// Holographic scan-line — a razor-thin horizontal plane that sweeps
// from the bottom of the orb to the top over exactly 4 seconds, then
// instantly resets and repeats.  The "holographic refresh" detail:
// extremely subtle but communicates that the orb is an active display,
// not a passive object.
//
// Behaviour:
//   - Only visible during executing and planning phases
//   - During idle (and any other phase): opacity fades to 0
//   - PlaneGeometry(3.0, 0.002) — wider than the orb, hairline thin
//   - Pure white, opacity 0.06, AdditiveBlending
//   - Position.y sweeps from -2.5 to +2.5 over 4 s, then resets

import { useRef, useMemo } from 'react';
import { useFrame }        from '@react-three/fiber';
import * as THREE          from 'three';

const SCAN_MIN      = -2.5;
const SCAN_MAX      =  2.5;
const SCAN_DURATION =  4.0;   // seconds for one full sweep

export default function ScanLine({ phase }) {
  const meshRef    = useRef();
  const scanTimeRef = useRef(0);
  const opacityRef  = useRef(0);

  const isActive = phase === 'executing' || phase === 'planning';

  const geo = useMemo(() => new THREE.PlaneGeometry(3.0, 0.002), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    color:      0xffffff,
    transparent: true,
    opacity:     0,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    toneMapped:  false,
    side:        THREE.DoubleSide,
  }), []);

  useFrame((_, dt) => {
    if (!meshRef.current) return;

    // Smooth opacity transition
    const targetOpacity = isActive ? 0.06 : 0.0;
    opacityRef.current += (targetOpacity - opacityRef.current) * 0.05;
    mat.opacity = opacityRef.current;

    // Only advance the scan timer when actually visible
    if (opacityRef.current < 0.001) return;

    scanTimeRef.current += dt;
    if (scanTimeRef.current >= SCAN_DURATION) {
      scanTimeRef.current -= SCAN_DURATION;
    }

    const progress = scanTimeRef.current / SCAN_DURATION;
    meshRef.current.position.y = SCAN_MIN + (SCAN_MAX - SCAN_MIN) * progress;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geo}
      material={mat}
      frustumCulled={false}
    />
  );
}
