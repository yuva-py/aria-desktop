// src/components/shared/LiveStrip.jsx
// Shows ariaStore.currentGoal as one line of muted text.
//
// Phase dot:
//   - Colour comes from accentForPhase() (no static CSS data-phase rules)
//   - Framer Motion pulses scale + opacity on a 2-second loop
//   - Glow matches the phase accent
//
// Text:
//   - AnimatePresence key=currentGoal gives fade-y on every change
//   - .text-projected adds subtle chromatic fringe
//
// Renders nothing while phase === 'idle' or goal is empty.

import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useAriaStore      from '../../store/ariaStore';
import { accentForPhase } from '../../constants/accentStrategy';
import './LiveStrip.css';

export default function LiveStrip() {
  const phase       = useAriaStore((s) => s.phase);
  const currentGoal = useAriaStore((s) => s.currentGoal);

  const accent    = useMemo(() => accentForPhase(phase), [phase]);
  const isVisible = phase !== 'idle' && currentGoal.trim().length > 0;

  return (
    <div className="live-strip" role="status" aria-live="polite">
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.p
            key={currentGoal}
            className="live-strip__text text-projected"
            initial={{ opacity: 0, y: 8  }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Phase-aware animated dot */}
            <motion.span
              className="live-strip__phase-dot"
              aria-hidden="true"
              style={{
                background:        accent.dot,
                boxShadow:         `0 0 8px ${accent.glow}, 0 0 3px ${accent.dot}`,
                '--live-dot-color': accent.dot,
              }}
              animate={{
                scale:   [1, 1.30, 1],
                opacity: [0.80, 1, 0.80],
              }}
              transition={{
                duration: 2,
                ease:     'easeInOut',
                repeat:   Infinity,
                repeatType: 'loop',
              }}
            />

            {currentGoal}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
