// src/components/shared/FloatingStatusChip.jsx
//
// Tiny pill that floats above the orb and broadcasts the current ARIA phase.
// Transitions on every phase change via AnimatePresence key={phase}.
//
// Position: fixed, top ≈ 29%, centered — sits in the negative space between
// the orb top and the window header, never overlapping orb geometry.

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAriaStore from '../../store/ariaStore';
import './FloatingStatusChip.css';

// ── Phase display config ──────────────────────────────────────────────────────
const CHIP_CONFIG = {
  idle:       {
    label:  'IDLE',
    accent: 'rgba(100, 160, 255, 0.90)',
    border: 'rgba(100, 160, 255, 0.28)',
    glow:   'rgba(100, 160, 255, 0.14)',
  },
  planning:   {
    label:  'PLANNING',
    accent: 'rgba(190, 130, 255, 0.90)',
    border: 'rgba(190, 130, 255, 0.28)',
    glow:   'rgba(190, 130, 255, 0.14)',
  },
  executing:  {
    label:  'EXECUTING',
    accent: 'rgba( 60, 220, 180, 0.90)',
    border: 'rgba( 60, 220, 180, 0.28)',
    glow:   'rgba( 60, 220, 180, 0.14)',
  },
  recovering: {
    label:  'RECOVERING',
    accent: 'rgba(255, 200,  80, 0.90)',
    border: 'rgba(255, 200,  80, 0.28)',
    glow:   'rgba(255, 200,  80, 0.14)',
  },
  error:      {
    label:  'ERROR',
    accent: 'rgba(255,  80,  80, 0.90)',
    border: 'rgba(255,  80,  80, 0.28)',
    glow:   'rgba(255,  80,  80, 0.14)',
  },
  complete:   {
    label:  'COMPLETE',
    accent: 'rgba( 80, 255, 150, 0.90)',
    border: 'rgba( 80, 255, 150, 0.28)',
    glow:   'rgba( 80, 255, 150, 0.14)',
  },
  tier3:      {
    label:  'AWAITING CONFIRMATION',
    accent: 'rgba(255, 140,  40, 0.90)',
    border: 'rgba(255, 140,  40, 0.28)',
    glow:   'rgba(255, 140,  40, 0.14)',
  },
};

const FALLBACK = CHIP_CONFIG.idle;

// ── Shared enter/exit base ────────────────────────────────────────────────────
const BASE_INITIAL  = { y: -7, opacity: 0, scale: 0.90 };
const BASE_EXIT     = { y:  6, opacity: 0, scale: 0.92 };

// Phase-specific animate targets — complete gets a scale pop, error shakes
function getAnimate(phase) {
  if (phase === 'complete') {
    return { y: 0, opacity: 1, scale: [0.90, 1.10, 1.00] };
  }
  if (phase === 'error') {
    return { y: 0, opacity: 1, x: [0, -4, 4, -4, 4, -2, 2, 0] };
  }
  return { y: 0, opacity: 1, scale: 1.00 };
}

function getTransition(phase) {
  if (phase === 'complete' || phase === 'error') {
    return { duration: 0.40, ease: 'easeOut' };
  }
  return { duration: 0.20, ease: [0.32, 0, 0.67, 0] };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FloatingStatusChip() {
  const phase  = useAriaStore((s) => s.phase);
  const config = CHIP_CONFIG[phase] ?? FALLBACK;

  return (
    <div className="fsc__positioner" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="fsc__chip"
          style={{
            '--fsc-accent': config.accent,
            '--fsc-border': config.border,
            '--fsc-glow':   config.glow,
          }}
          initial={BASE_INITIAL}
          animate={getAnimate(phase)}
          exit={BASE_EXIT}
          transition={getTransition(phase)}
        >
          <span className="fsc__dot" aria-hidden="true" />
          <span className="fsc__label">{config.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
