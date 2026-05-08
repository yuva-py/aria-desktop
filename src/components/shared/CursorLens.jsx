// src/components/shared/CursorLens.jsx
// Small lens-flare dot that appears at the cursor when it's near the orb rim.
// Driven by useCursorRefraction. Uses Framer Motion for spring-trailed
// position so the flare follows the cursor with a tiny lag, evoking
// "touching a glass surface."

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSettingsStore     from '../../store/settingsStore';
import useCursorRefraction  from '../../hooks/useCursorRefraction';
import './CursorLens.css';

const ORB_SCALE_HINT = { small: 0.75, medium: 1.0, large: 1.25 };

export default function CursorLens() {
  const orbSize = useSettingsStore((s) => s.orbSize);
  const { visible, x, y } = useCursorRefraction(ORB_SCALE_HINT[orbSize] ?? 1);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="cursor-lens"
          className="cursor-lens"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: 0.45,
            scale:   1,
            x:       x,
            y:       y,
          }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{
            opacity: { duration: 0.18, ease: 'easeOut' },
            scale:   { duration: 0.18, ease: 'easeOut' },
            x:       { type: 'spring', stiffness: 800, damping: 35, mass: 0.15 },
            y:       { type: 'spring', stiffness: 800, damping: 35, mass: 0.15 },
          }}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}
