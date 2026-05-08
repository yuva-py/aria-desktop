// src/components/shared/ThemeToggle.jsx
// Small button in the top-right corner.
// Toggles settingsStore.theme between 'crystal' and 'obsidian' and orchestrates
// the orb implode → swap → emerge animation by dispatching `aria:theme-transition`
// events on the window. OrbMesh listens and animates.
//
// Timeline:
//   T+0     dispatch 'imploding'  → orb scales toward 0 over ~400 ms
//   T+400   actually swap theme + body class
//           dispatch 'emerging'   → orb scales back up + prismatic burst
//   T+1000  dispatch 'idle'        → orb returns to phase-driven uniforms

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSettingsStore from '../../store/settingsStore';
import './ThemeToggle.css';

const THEMES = ['crystal', 'obsidian'];

const IMPLODE_MS = 400;   // matches OrbMesh imploding lerp factor (~0.18)
const EMERGE_MS  = 600;   // matches OrbMesh emerging lerp factor (~0.085)

function dispatch(detail) {
  window.dispatchEvent(new CustomEvent('aria:theme-transition', { detail }));
}

export default function ThemeToggle() {
  const theme    = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // Guard against rapid toggling — ignore clicks during an in-flight transition
  const inFlightRef = useRef(false);

  const [hovered,    setHovered]    = useState(false);
  const [transiting, setTransiting] = useState(false);

  const toggle = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setTransiting(true);

    const next = theme === 'crystal' ? 'obsidian' : 'crystal';

    // 1. Begin imploding — orb starts shrinking
    dispatch('imploding');

    // 2. After implode completes: swap theme + body class, begin emerging
    setTimeout(() => {
      setTheme(next);
      document.body.classList.remove(...THEMES);
      document.body.classList.add(next);
      dispatch('emerging');
    }, IMPLODE_MS);

    // 3. After emerge completes: settle back to idle uniforms
    setTimeout(() => {
      dispatch('idle');
      inFlightRef.current = false;
      setTransiting(false);
    }, IMPLODE_MS + EMERGE_MS);
  }, [theme, setTheme]);

  const nextTheme = theme === 'crystal' ? 'Obsidian' : 'Crystal';
  const label     = `Switch to ${nextTheme}`;

  // Icon: crystal = prism ◈, obsidian = dark circle ◉
  const icon = theme === 'crystal' ? '◈' : '◉';

  return (
    <div
      className="theme-toggle-wrapper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.button
        id="aria-theme-toggle"
        className={`theme-toggle${transiting ? ' theme-toggle--transiting' : ''}`}
        onClick={toggle}
        aria-label={label}
        whileHover={{ scale: 1.10 }}
        whileTap={{   scale: 0.90 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      >
        <span className="theme-toggle__icon" aria-hidden="true">{icon}</span>
        <span className="theme-toggle__label">{theme}</span>
      </motion.button>

      {/* Custom tooltip materialises below on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.span
            className="theme-toggle__tooltip"
            role="tooltip"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -4, scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
