// src/components/orb/ARIAOrb.jsx
// Full-viewport WebGL canvas — renders behind all DOM elements.
// The canvas is position:fixed, fully transparent — the desktop / browser
// page beneath it shows through wherever nothing is drawn.

import React, { Suspense } from 'react';
import { Canvas }          from '@react-three/fiber';
// EffectComposer removed — postprocessing intermediate render targets break
// the alpha channel on transparent Electron windows (non-orb areas receive
// opaque black from the pipeline instead of staying fully transparent).
// The orb glows naturally through AdditiveBlending; no Bloom pass needed.

import useAriaStore from '../../store/ariaStore';

import OrbMesh       from './OrbMesh';
import NeuralField   from './particles/NeuralField';
import SpectralStreaks from './particles/SpectralStreaks';
import OrbitalRing   from './OrbitalRing';
import ScanLine      from './ScanLine';
// AmbientParticles replaced by NeuralField (synapse constellation).
// SpectralRays removed — PointsMaterial dots appeared black through the
// DWM compositor on Windows transparent windows.  SpectralStreaks covers
// the visual intent with camera-aligned ribbons.

// ── Scene ─────────────────────────────────────────────────────────────────────
function Scene() {
  const phase       = useAriaStore((s) => s.phase);
  const currentTool = useAriaStore((s) => s.currentTool);

  return (
    <>
      <OrbMesh />
      <OrbitalRing />
      <ScanLine       phase={phase} />
      <NeuralField    phase={phase} currentTool={currentTool} />
      <SpectralStreaks phase={phase} currentTool={currentTool} />
    </>
  );
}

// ── ARIAOrb ───────────────────────────────────────────────────────────────────
export default function ARIAOrb() {
  return (
    <Canvas
      // ── WebGL context: alpha channel required for transparency ─────────────
      gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
      camera={{ fov: 45, near: 0.1, far: 100, position: [0, -0.62, 6] }}
      style={{
        // Fixed to viewport so it always covers the full screen.
        position:   'fixed',
        top:        0,
        left:       0,
        width:      '100vw',
        height:     '100vh',
        zIndex:     0,
        // Explicit transparent background on the <canvas> element itself.
        // Without this, browsers paint the canvas element background as black
        // even when the WebGL clear color is (0,0,0,0).
        background: 'transparent',
        pointerEvents: 'none',
        // No border, shadow, or outline whatsoever
        border:     'none',
        outline:    'none',
        boxShadow:  'none',
      }}
      onCreated={({ gl, scene }) => {
        // Force WebGL to clear to fully transparent
        gl.setClearColor(0x000000, 0);
        // Three.js scene background must also be null (not black)
        scene.background = null;
      }}
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
