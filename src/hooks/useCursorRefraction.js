// src/hooks/useCursorRefraction.js
// Tracks the cursor's proximity to the orb edge so a small lens-flare can be
// rendered when the cursor "refracts through" the orb's rim.
//
// The orb is a WebGL sphere whose visual center sits roughly at:
//   x = window.innerWidth / 2
//   y = window.innerHeight * 0.36   (the App pads main with 300 px top so the
//                                    orb center ends up high in the viewport)
//
// Heuristic radius — calculated from the camera distance (6 units) and the
// orb scale (~1 world unit). At 45° fov, world unit ≈ 0.207 × viewportHeight.
// We use a simple constant of ~0.20 × innerHeight × orbScale.
//
// Returns: { visible, x, y } — visible is true when the cursor is within
// REFRACTION_RADIUS_PX of the orb's screen-space rim.

import { useEffect, useState } from 'react';

const REFRACTION_RADIUS_PX = 60;     // proximity to rim that activates the flare

// Orb-center heuristic in viewport coords.
function orbCenter() {
  return {
    cx: window.innerWidth  * 0.5,
    cy: window.innerHeight * 0.36,
  };
}

// Approximate the orb's screen-space radius in pixels.
function orbScreenRadius(orbScaleHint = 1) {
  // Camera fov 45°, distance 6 units → world unit at orb plane occupies
  // roughly (height / 2) / (3 / tan(22.5°)) ≈ 0.207 × innerHeight.
  return window.innerHeight * 0.207 * orbScaleHint;
}

export default function useCursorRefraction(orbScaleHint = 1) {
  const [state, setState] = useState({ visible: false, x: 0, y: 0 });

  useEffect(() => {
    const handle = (e) => {
      const { cx, cy } = orbCenter();
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);

      const r = orbScreenRadius(orbScaleHint);
      // Visible when within REFRACTION_RADIUS_PX of the orb rim
      const visible = Math.abs(dist - r) < REFRACTION_RADIUS_PX;

      setState({ visible, x: e.clientX, y: e.clientY });
    };

    const hide = () => setState((s) => ({ ...s, visible: false }));

    window.addEventListener('mousemove', handle, { passive: true });
    window.addEventListener('mouseout',  hide);
    return () => {
      window.removeEventListener('mousemove', handle);
      window.removeEventListener('mouseout',  hide);
    };
  }, [orbScaleHint]);

  return state;
}
