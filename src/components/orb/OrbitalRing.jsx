// src/components/orb/OrbitalRing.jsx
// Two counter-rotating torus rings — gives the orb a planetary quality.
//
// Inner ring (r=2.1, tube=0.004):
//   - ShaderMaterial: spectral gradient flows around the circumference over time
//     via uTime — the spectrum completes one loop every ~17 s, creating a slow
//     liquid-light effect independent of the physical rotation.
//   - Alpha: 0.6 base + sin(vUv.x * PI * 8) gives 8 bright/dim scallops.
//   - Opacity lerps between phase targets (idle 0.30 → executing 0.70).
//   - rotation.x=0.35, rotation.z=0.12 — moderate tilt
//   - rotation.y += 0.004 per frame
//
// Outer ring (r=2.6, tube=0.002):
//   - MeshBasicMaterial white/silver, opacity responds to phase (0.10–0.22).
//   - rotation.x=-0.5, rotation.z=0.2 — opposite tilt
//   - rotation.y -= 0.003 per frame

import { useRef, useMemo } from 'react';
import { useFrame }        from '@react-three/fiber';
import * as THREE          from 'three';
import useAriaStore        from '../../store/ariaStore';
import { audioState }      from '../../hooks/useAudioReactivity';

// ─────────────────────────────────────────────────────────────────────────────
// Inline GLSL — spectral gradient flows along ring circumference over time
// ─────────────────────────────────────────────────────────────────────────────
const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv         = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
#define PI 3.14159265359
uniform float uOpacity;
uniform float uTime;
varying vec2  vUv;

// Branchless piecewise spectral colour — same stops as SpectralStreaks
vec3 spectralColor(float t) {
  t *= 5.0;                          // map [0,1] → [0,5] segment space
  vec3 c0 = vec3(1.0, 0.00, 0.00);  // red
  vec3 c1 = vec3(1.0, 0.50, 0.00);  // amber
  vec3 c2 = vec3(1.0, 1.00, 0.00);  // yellow
  vec3 c3 = vec3(0.0, 1.00, 0.30);  // green
  vec3 c4 = vec3(0.0, 0.30, 1.00);  // blue
  vec3 c5 = vec3(0.6, 0.00, 1.00);  // violet
  vec3 col = mix(c0, c1, clamp(t,       0.0, 1.0));
  col = mix(col, mix(c1, c2, clamp(t - 1.0, 0.0, 1.0)), step(1.0, t));
  col = mix(col, mix(c2, c3, clamp(t - 2.0, 0.0, 1.0)), step(2.0, t));
  col = mix(col, mix(c3, c4, clamp(t - 3.0, 0.0, 1.0)), step(3.0, t));
  col = mix(col, mix(c4, c5, clamp(t - 4.0, 0.0, 1.0)), step(4.0, t));
  return col;
}

void main() {
  // Spectrum slowly flows around the ring — one cycle every ~17 s
  float t     = mod(vUv.x + uTime * 0.06, 1.0);
  vec3  col   = spectralColor(t);
  // 8 bright/dim scallops fixed to the ring's UV space
  float alpha = 0.6 + sin(vUv.x * PI * 8.0) * 0.3;
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * uOpacity);
}
`;

// ── Phase → inner ring opacity target ────────────────────────────────────────
const PHASE_OPACITY = {
  idle:       0.30,
  planning:   0.45,
  executing:  0.70,
  recovering: 0.40,
  error:      0.55,
  complete:   0.65,
  tier3:      0.50,
};

// ── Phase → outer ring opacity target ────────────────────────────────────────
const OUTER_OPACITY = {
  idle:       0.10,
  planning:   0.14,
  executing:  0.22,
  recovering: 0.12,
  error:      0.18,
  complete:   0.24,
  tier3:      0.08,
};

// ─────────────────────────────────────────────────────────────────────────────
export default function OrbitalRing() {
  const phase = useAriaStore((s) => s.phase);

  const innerRef   = useRef();
  const outerRef   = useRef();
  const opacityRef = useRef(PHASE_OPACITY.idle);
  const outerOpRef = useRef(OUTER_OPACITY.idle);

  // ── Inner ring — spectral ShaderMaterial with animated spectrum ───────────
  const innerMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms: {
      uOpacity: { value: opacityRef.current },
      uTime:    { value: 0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.DoubleSide,
  }), []);

  // ── Outer ring — white/silver with phase-aware opacity ───────────────────
  const outerMat = useMemo(() => new THREE.MeshBasicMaterial({
    color:       0xc8c8e0,
    transparent: true,
    opacity:     outerOpRef.current,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.DoubleSide,
  }), []);

  // ── Geometries ────────────────────────────────────────────────────────────
  const innerGeo = useMemo(() => new THREE.TorusGeometry(2.1, 0.004, 2, 128), []);
  const outerGeo = useMemo(() => new THREE.TorusGeometry(2.6, 0.002, 2, 128), []);

  // ── Per-frame update ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const amp = audioState.combinedAmplitude;

    // Spin speeds accelerate with audio amplitude
    if (innerRef.current) {
      innerRef.current.rotation.y += 0.004 + amp * 0.020;
      // Subtle radial breathe — ring expands very slightly on loud moments
      innerRef.current.scale.setScalar(1.0 + amp * 0.05);
    }
    if (outerRef.current) {
      outerRef.current.rotation.y -= 0.003 + amp * 0.015;
    }

    // Feed elapsed time into shader so spectrum flows
    innerMat.uniforms.uTime.value = clock.getElapsedTime();

    // Smoothly lerp inner ring opacity toward phase target + amplitude boost
    const innerTarget = PHASE_OPACITY[phase] ?? PHASE_OPACITY.idle;
    opacityRef.current += (innerTarget - opacityRef.current) * 0.04;
    innerMat.uniforms.uOpacity.value = Math.min(1.0, opacityRef.current + amp * 0.40);

    // Smoothly lerp outer ring opacity toward phase target
    const outerTarget = OUTER_OPACITY[phase] ?? OUTER_OPACITY.idle;
    outerOpRef.current += (outerTarget - outerOpRef.current) * 0.04;
    outerMat.opacity = outerOpRef.current;
  });

  return (
    <group>
      {/* Inner: flowing spectral gradient, tilted moderately */}
      <mesh
        ref={innerRef}
        geometry={innerGeo}
        material={innerMat}
        rotation-x={0.35}
        rotation-z={0.12}
        frustumCulled={false}
      />

      {/* Outer: silver, opposite tilt, phase-aware opacity */}
      <mesh
        ref={outerRef}
        geometry={outerGeo}
        material={outerMat}
        rotation-x={-0.5}
        rotation-z={0.2}
        frustumCulled={false}
      />
    </group>
  );
}
