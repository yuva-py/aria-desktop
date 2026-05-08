// src/components/orb/OrbMesh.jsx
// Animated sphere with the ARIA custom ShaderMaterial.
//
// • Loads vertex/fragment shaders from the .glsl files
// • Reads phase + currentTool from ariaStore
// • Drives all uniforms via OrbStateMapper.getOrbUniforms()
// • useFrame: ticks uTime and smoothly lerps all scalar/colour uniforms
// • Theme transition: listens for `aria:theme-transition` events
//     - 'imploding' → scale lerps fast to 0
//     - 'emerging'  → scale lerps from 0 back to target + intensity burst
//     - 'idle'      → normal phase-driven uniforms
// • Window show: on document `visibilitychange` (hidden→visible) the orb
//   resets scale to 0 and emerges with a prismatic burst.

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame }               from '@react-three/fiber';
import * as THREE                 from 'three';

import useAriaStore      from '../../store/ariaStore';
import useSettingsStore  from '../../store/settingsStore';
import { getOrbUniforms } from './OrbStateMapper';
import { audioState }    from '../../hooks/useAudioReactivity';

import vertexShader   from './shaders/orb.vert.glsl?raw';
import fragmentShader from './shaders/orb.frag.glsl?raw';

// ── Lerp helpers ──────────────────────────────────────────────────────────────
function lerpScalar(a, b, t) { return a + (b - a) * t; }
function lerpColor([ar, ag, ab], [br, bg, bb], t) {
  return [ar+(br-ar)*t, ag+(bg-ag)*t, ab+(bb-ab)*t];
}

// ── Orb size map ──────────────────────────────────────────────────────────────
const ORB_SCALE = { small: 0.75, medium: 1.0, large: 1.25 };

// ── Component ─────────────────────────────────────────────────────────────────
export default function OrbMesh() {
  const meshRef     = useRef();
  const groupRef    = useRef();
  const phase       = useAriaStore((s) => s.phase);
  const currentTool = useAriaStore((s) => s.currentTool);
  const orbSize     = useSettingsStore((s) => s.orbSize);

  // ── Cursor parallax — track normalised mouse position ───────────────────────
  const mouse = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  // Mutable lerp state (separate from Three.js uniform objects)
  const current = useRef({
    uStateColor:          [0.40, 0.30, 0.80],
    uIntensity:           0.3,
    uPulseSpeed:          0.6,
    uIridescenceStrength: 0.6,
    uDistortion:          0.02,
    scale:                1.0,
  });

  // Theme/visibility transition state
  // mode: 'idle' | 'imploding' | 'emerging'
  // burstT decays 1 → 0 during emerge, drives the prismatic intensity boost.
  const transitionRef = useRef({ mode: 'idle', burstT: 0 });

  const uniforms = useMemo(() => ({
    uTime:                { value: 0 },
    uStateColor:          { value: new THREE.Color(...current.current.uStateColor) },
    uIntensity:           { value: current.current.uIntensity },
    uPulseSpeed:          { value: current.current.uPulseSpeed },
    uIridescenceStrength: { value: current.current.uIridescenceStrength },
    uDistortion:          { value: current.current.uDistortion },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const targetUniforms = useMemo(
    () => getOrbUniforms(phase, currentTool),
    [phase, currentTool]
  );

  // ── Theme-transition event listener ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const mode = e.detail;
      transitionRef.current.mode = mode;
      // Fire the burst when entering 'emerging'
      if (mode === 'emerging') {
        transitionRef.current.burstT = 1.0;
      }
    };
    window.addEventListener('aria:theme-transition', handler);
    return () => window.removeEventListener('aria:theme-transition', handler);
  }, []);

  // ── Window visibility — emerge on each show ─────────────────────────────────
  useEffect(() => {
    const triggerEmerge = () => {
      transitionRef.current.mode   = 'emerging';
      transitionRef.current.burstT = 1.0;
      // Reset scale to nearly zero so the lerp brings it back up dramatically
      current.current.scale = 0.001;
      // Settle back to idle once the emerge animation has played out
      window.setTimeout(() => {
        if (transitionRef.current.mode === 'emerging') {
          transitionRef.current.mode = 'idle';
        }
      }, 800);
    };

    const handler = () => {
      if (!document.hidden) triggerEmerge();
    };
    document.addEventListener('visibilitychange', handler);

    // Also trigger on initial mount so first paint is the prismatic emergence
    triggerEmerge();

    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useFrame(({ clock }) => {
    const t = 0.04; // per-frame phase-uniform lerp factor
    uniforms.uTime.value = clock.getElapsedTime();

    const target = targetUniforms;
    const cur    = current.current;

    cur.uStateColor          = lerpColor(cur.uStateColor, target.uStateColor, t);
    cur.uIntensity           = lerpScalar(cur.uIntensity,           target.uIntensity,           t);
    cur.uPulseSpeed          = lerpScalar(cur.uPulseSpeed,          target.uPulseSpeed,          t);
    cur.uIridescenceStrength = lerpScalar(cur.uIridescenceStrength, target.uIridescenceStrength,  t);
    cur.uDistortion          = lerpScalar(cur.uDistortion,          target.uDistortion,           t);

    // ── Transition-driven scale + intensity boost ───────────────────────────
    const tr        = transitionRef.current;
    const baseScale = ORB_SCALE[orbSize] ?? 1.0;

    let scaleTarget = baseScale;
    let scaleLerp   = 0.06;

    if (tr.mode === 'imploding') {
      scaleTarget = 0;
      scaleLerp   = 0.18;   // ~400 ms to fully implode
    } else if (tr.mode === 'emerging') {
      scaleTarget = baseScale;
      scaleLerp   = 0.085;  // ~600 ms to fully emerge
    }

    cur.scale = lerpScalar(cur.scale, scaleTarget, scaleLerp);

    // Decay the burst envelope over ~700 ms (60 fps × 0.018 ≈ 1.08 s ceiling)
    if (tr.burstT > 0) tr.burstT = Math.max(0, tr.burstT - 0.018);
    const burst = tr.burstT;

    // ── Apply uniforms (burst + audio amplitude modifiers) ──────────────────
    const amp = audioState.combinedAmplitude;
    uniforms.uStateColor.value.setRGB(...cur.uStateColor);
    uniforms.uIntensity.value           = cur.uIntensity * (1.0 + burst * 0.80) + amp * 0.25;
    uniforms.uPulseSpeed.value          = cur.uPulseSpeed;
    uniforms.uIridescenceStrength.value = cur.uIridescenceStrength * (1.0 + burst * 0.50);
    uniforms.uDistortion.value          = cur.uDistortion + amp * 0.06;

    if (meshRef.current) {
      // Speaking → orb swells outward; listening → gently contracts ("inhaling")
      const ampScale = audioState.isSpeaking
        ? 1.0 + amp * 0.18
        : audioState.isListening
          ? 1.0 - audioState.micAmplitude * 0.08
          : 1.0;
      meshRef.current.scale.setScalar(cur.scale * ampScale);
    }

    // ── Cursor parallax on the group ─────────────────────────────────────────
    if (groupRef.current) {
      const mx = mouse.current.x;
      const my = mouse.current.y;
      // Position: float toward cursor, max ±0.15x, ±0.1y
      groupRef.current.position.x += (mx * 0.15 - groupRef.current.position.x) * 0.05;
      groupRef.current.position.y += (my * 0.10 - groupRef.current.position.y) * 0.05;
      // Subtle tilt — orb feels aware
      groupRef.current.rotation.y += ( mx * 0.10 - groupRef.current.rotation.y) * 0.03;
      groupRef.current.rotation.x += (-my * 0.06 - groupRef.current.rotation.x) * 0.03;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 64]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          blending={THREE.AdditiveBlending}
          side={THREE.FrontSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
