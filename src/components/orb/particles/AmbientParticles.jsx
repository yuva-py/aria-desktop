// src/components/orb/particles/AmbientParticles.jsx
// Three depth-layered particle populations — near, mid, far.
// Plus 15 elongated "streak" particles oriented along orbit tangent
// for motion-blur feel.
//
// All particles are billboard PlaneGeometry sprites with a soft radial
// glow texture — zero hard boundary at edge.

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, Matrix4, Vector3, MathUtils, CanvasTexture, Quaternion } from 'three';
import * as THREE from 'three';

import useAriaStore      from '../../../store/ariaStore';
import { getOrbUniforms } from '../OrbStateMapper';

// ── Phase config ──────────────────────────────────────────────────────────────
const PHASE_CONFIG = {
  idle:       { opacity: 0.35, speedMult: 0.55 },
  planning:   { opacity: 0.45, speedMult: 0.90 },
  executing:  { opacity: 0.65, speedMult: 2.00 },
  recovering: { opacity: 0.50, speedMult: 1.30 },
  error:      { opacity: 0.55, speedMult: 1.60 },
  complete:   { opacity: 0.75, speedMult: 2.80 },
  tier3:      { opacity: 0.60, speedMult: 0.40 },
};

const COLOR_LERP   = 0.015;
const OPACITY_LERP = 0.030;
const SPEED_LERP   = 0.020;

// ── Glow texture — 4-stop ultra-soft radial gradient ─────────────────────────
function buildGlowTexture() {
  const size   = 64;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx  = canvas.getContext('2d');
  const half = size / 2;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0,   'rgba(255,255,255,1.0)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  return new CanvasTexture(canvas);
}

// ── Streak texture — elongated radial, 3:1 aspect ────────────────────────────
function buildStreakTexture() {
  const w = 96, h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Elliptical gradient — wide along X, narrow along Y
  const grad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
  grad.addColorStop(0,    'rgba(255,255,255,1.0)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.5,  'rgba(255,255,255,0.15)');
  grad.addColorStop(1.0,  'rgba(255,255,255,0)');

  // Scale context to squash Y so gradient becomes elliptical
  ctx.save();
  ctx.translate(w/2, h/2);
  ctx.scale(1, h / w);
  ctx.translate(-w/2, -h/2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  return new CanvasTexture(canvas);
}

// ── Three population layers + streak particles ────────────────────────────────
function buildParticleData() {
  const round  = [];  // regular soft-glow circles
  const streak = [];  // elongated, orbit-tangent aligned

  // MID: 120 normal orbits
  for (let i = 0; i < 120; i++) {
    const r    = 1.8 + Math.random() * 1.0;
    const base = THREE.MathUtils.mapLinear(r, 1.8, 2.8, 0.12, 0.07);
    round.push({
      orbitRadius:  r,
      orbitSpeed:   0.10 + Math.random() * 0.20,
      orbitTilt:    Math.random() * Math.PI,
      phaseOffset:  Math.random() * Math.PI * 2,
      twinkleSpeed: 0.4 + Math.random() * 1.2,
      twinklePhase: Math.random() * Math.PI * 2,
      baseSize:     Math.max(0.04, base * (0.5 + Math.random() * 1.0)),
    });
  }

  // NEAR: 50 inner tight particles
  for (let i = 0; i < 50; i++) {
    const r = 1.2 + Math.random() * 0.4;
    round.push({
      orbitRadius:  r,
      orbitSpeed:   0.25 + Math.random() * 0.35,
      orbitTilt:    Math.random() * Math.PI,
      phaseOffset:  Math.random() * Math.PI * 2,
      twinkleSpeed: 1.0 + Math.random() * 2.0,
      twinklePhase: Math.random() * Math.PI * 2,
      baseSize:     0.04 + Math.random() * 0.04,
    });
  }

  // FAR: 30 large soft background bloom
  for (let i = 0; i < 30; i++) {
    const r = 3.5 + Math.random() * 1.5;
    round.push({
      orbitRadius:  r,
      orbitSpeed:   0.02 + Math.random() * 0.05,
      orbitTilt:    Math.random() * Math.PI,
      phaseOffset:  Math.random() * Math.PI * 2,
      twinkleSpeed: 0.2 + Math.random() * 0.5,
      twinklePhase: Math.random() * Math.PI * 2,
      baseSize:     0.14 + Math.random() * 0.08,
    });
  }

  // STREAK: 15 elongated motion-blur particles
  for (let i = 0; i < 15; i++) {
    const r = 1.5 + Math.random() * 1.8;
    streak.push({
      orbitRadius:  r,
      orbitSpeed:   0.12 + Math.random() * 0.25,
      orbitTilt:    Math.random() * Math.PI,
      phaseOffset:  Math.random() * Math.PI * 2,
      twinkleSpeed: 0.6 + Math.random() * 1.0,
      twinklePhase: Math.random() * Math.PI * 2,
      // Width 0.04, height 0.012 — 3:1 elongated sprite
      baseWidth:    0.035 + Math.random() * 0.015,
      baseHeight:   0.010 + Math.random() * 0.006,
    });
  }

  return { round, streak };
}

const ROUND_COUNT  = 200; // 120 + 50 + 30
const STREAK_COUNT = 15;

// ── Component ─────────────────────────────────────────────────────────────────
export default function AmbientParticles({ phase, currentTool }) {
  const { camera } = useThree();

  const targetUniforms = useMemo(
    () => getOrbUniforms(phase, currentTool),
    [phase, currentTool]
  );

  const { round: roundParts, streak: streakParts } = useMemo(() => buildParticleData(), []);
  const glowTex   = useMemo(() => buildGlowTexture(),   []);
  const streakTex = useMemo(() => buildStreakTexture(),  []);

  const roundRef  = useRef();
  const streakRef = useRef();

  const lerpedColor   = useRef(new Color(...targetUniforms.uStateColor));
  const lerpedOpacity = useRef(PHASE_CONFIG[phase]?.opacity ?? 0.35);
  const lerpedSpeed   = useRef(PHASE_CONFIG[phase]?.speedMult ?? 0.55);
  const elapsed       = useRef(0);

  // Frame-reusable allocations
  const _mat      = useMemo(() => new Matrix4(),    []);
  const _pos      = useMemo(() => new Vector3(),    []);
  const _scl      = useMemo(() => new Vector3(),    []);
  const _qCam     = useMemo(() => new Quaternion(), []);
  const _qTangent = useMemo(() => new Quaternion(), []);
  const _qFinal   = useMemo(() => new Quaternion(), []);
  const _tangent  = useMemo(() => new Vector3(),    []);
  const _up       = useMemo(() => new Vector3(0, 1, 0), []);
  const _target   = useMemo(() => new Color(), []);
  const _col      = useMemo(() => new Color(), []);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t   = elapsed.current;
    const cfg = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle;

    const fOpacity = 1 - Math.pow(1 - OPACITY_LERP, delta * 60);
    const fSpeed   = 1 - Math.pow(1 - SPEED_LERP,   delta * 60);
    const fColor   = 1 - Math.pow(1 - COLOR_LERP,   delta * 60);

    lerpedOpacity.current = MathUtils.lerp(lerpedOpacity.current, cfg.opacity,   fOpacity);
    lerpedSpeed.current   = MathUtils.lerp(lerpedSpeed.current,   cfg.speedMult, fSpeed);

    const [r, g, b] = targetUniforms.uStateColor;
    _target.setRGB(r, g, b);
    lerpedColor.current.lerp(_target, fColor);

    camera.getWorldQuaternion(_qCam);

    // ── Round particles ──────────────────────────────────────────────────────
    const roundMesh = roundRef.current;
    if (roundMesh) {
      roundMesh.material.opacity = lerpedOpacity.current;

      for (let i = 0; i < ROUND_COUNT; i++) {
        const p     = roundParts[i];
        const angle = t * p.orbitSpeed * lerpedSpeed.current + p.phaseOffset;

        const x = p.orbitRadius * Math.cos(angle);
        const y = p.orbitRadius * Math.sin(angle) * Math.cos(p.orbitTilt);
        const z = p.orbitRadius * Math.sin(angle) * Math.sin(p.orbitTilt);

        const twinkle = 1.0 + Math.sin(t * p.twinkleSpeed + p.twinklePhase) * 0.3;

        _pos.set(x, y, z);
        _scl.setScalar(p.baseSize * twinkle);
        _mat.compose(_pos, _qCam, _scl);
        roundMesh.setMatrixAt(i, _mat);

        const brightness = 0.65 + 0.35 * Math.sin(t * 0.5 + i * 2.399);
        _col.copy(lerpedColor.current).multiplyScalar(brightness);
        roundMesh.setColorAt(i, _col);
      }
      roundMesh.instanceMatrix.needsUpdate = true;
      if (roundMesh.instanceColor) roundMesh.instanceColor.needsUpdate = true;
    }

    // ── Streak particles (elongated, orbit-tangent aligned) ──────────────────
    const streakMesh = streakRef.current;
    if (streakMesh) {
      streakMesh.material.opacity = lerpedOpacity.current * 0.7;

      for (let i = 0; i < STREAK_COUNT; i++) {
        const p     = streakParts[i];
        const angle = t * p.orbitSpeed * lerpedSpeed.current + p.phaseOffset;

        // Position
        const x = p.orbitRadius * Math.cos(angle);
        const y = p.orbitRadius * Math.sin(angle) * Math.cos(p.orbitTilt);
        const z = p.orbitRadius * Math.sin(angle) * Math.sin(p.orbitTilt);

        // Orbit tangent = derivative of position w.r.t. angle
        const tx = -p.orbitRadius * Math.sin(angle);
        const ty =  p.orbitRadius * Math.cos(angle) * Math.cos(p.orbitTilt);
        const tz =  p.orbitRadius * Math.cos(angle) * Math.sin(p.orbitTilt);
        _tangent.set(tx, ty, tz).normalize();

        // Guard: if tangent is nearly parallel to _up, setFromUnitVectors
        // produces NaN. Fall back to camera-only quaternion for that frame.
        const dot = Math.abs(_tangent.dot(_up));
        if (dot > 0.999) {
          _mat.compose(_pos, _qCam, _scl);
        } else {
          _qTangent.setFromUnitVectors(_up, _tangent);
          _qFinal.multiplyQuaternions(_qCam, _qTangent);
          _mat.compose(_pos, _qFinal, _scl);
        }

        const twinkle = 1.0 + Math.sin(t * p.twinkleSpeed + p.twinklePhase) * 0.25;

        _pos.set(x, y, z);
        // Scale: non-uniform (width × height)
        _scl.set(p.baseWidth * twinkle, p.baseHeight * twinkle, 1);
        _mat.compose(_pos, _qFinal, _scl);
        streakMesh.setMatrixAt(i, _mat);

        const brightness = 0.8 + 0.2 * Math.sin(t * 0.7 + i * 1.618);
        _col.copy(lerpedColor.current).multiplyScalar(brightness * 1.2);
        streakMesh.setColorAt(i, _col);
      }
      streakMesh.instanceMatrix.needsUpdate = true;
      if (streakMesh.instanceColor) streakMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Round glow particles */}
      <instancedMesh ref={roundRef} args={[null, null, ROUND_COUNT]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={glowTex}
          transparent
          opacity={0.35}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* Elongated streak particles */}
      <instancedMesh ref={streakRef} args={[null, null, STREAK_COUNT]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={streakTex}
          transparent
          opacity={0.25}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </>
  );
}
