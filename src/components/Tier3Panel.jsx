// src/components/Tier3Panel.jsx
//
// Destructive-action confirmation panel.
// Rises from the bottom of the screen when ariaStore.phase === 'tier3'.
//
// Design decisions:
//   • Not a modal — it's anchored to the bottom edge, leaves the orb visible.
//   • Confirm button has a mandatory 2-second awareness delay before it is
//     clickable, signalled by an SVG arc that sweeps in over 2000 ms.
//   • The arc is driven by a CSS @keyframes animation (zero JS per-frame cost).
//   • "Hold..." → "Confirm — {action}" text swap happens after the timer.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import useAriaStore from '../store/ariaStore';
import './Tier3Panel.css';

// ── Constants ──────────────────────────────────────────────────────────────
const DELAY_MS       = 2000;
const ARC_RADIUS     = 17;           // radius of the SVG arc circle
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;   // ≈ 106.8 px

// ── Path truncation helper ─────────────────────────────────────────────────
// For long paths: keeps first 20 chars + "..." + last 20 chars
function truncatePath(path, keep = 20) {
  if (!path || path.length <= keep * 2 + 3) return path;
  return `${path.slice(0, keep)}…${path.slice(-keep)}`;
}

// ── Confirm button with SVG arc countdown ─────────────────────────────────
function ConfirmButton({ actionName, onConfirm }) {
  const [enabled, setEnabled]   = useState(false);
  const [animKey, setAnimKey]   = useState(0);   // remount arc on re-open
  const timerRef                = useRef(null);

  // Start the countdown whenever this component mounts
  useEffect(() => {
    setEnabled(false);
    setAnimKey((k) => k + 1);        // restart CSS animation
    timerRef.current = setTimeout(() => setEnabled(true), DELAY_MS);
    return () => clearTimeout(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="t3-confirm-wrapper">
      {/* SVG arc overlay — only shown while waiting */}
      {!enabled && (
        <svg
          className="t3-arc"
          key={animKey}
          width={38}
          height={38}
          viewBox="0 0 38 38"
          aria-hidden
        >
          {/* Dim track */}
          <circle
            cx={19} cy={19} r={ARC_RADIUS}
            fill="none"
            stroke="rgba(255,80,80,0.15)"
            strokeWidth={2}
          />
          {/* Animated fill arc */}
          <circle
            className="t3-arc__fill"
            cx={19} cy={19} r={ARC_RADIUS}
            fill="none"
            stroke="rgba(255,80,80,0.75)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={ARC_CIRCUMFERENCE}
            style={{
              '--t3-arc-circ': ARC_CIRCUMFERENCE,
            }}
            transform="rotate(-90 19 19)"
          />
        </svg>
      )}

      <button
        id="t3-confirm-btn"
        className={`t3-btn t3-btn--confirm${enabled ? ' t3-btn--confirm-ready' : ''}`}
        onClick={enabled ? onConfirm : undefined}
        disabled={!enabled}
        aria-label={enabled ? `Confirm ${actionName}` : 'Waiting…'}
        aria-busy={!enabled}
      >
        {enabled ? `Confirm — ${actionName}` : 'Hold…'}
      </button>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────
export default function Tier3Panel() {
  const tier3Action  = useAriaStore((s) => s.tier3Action);
  const confirmTier3 = useAriaStore((s) => s.confirmTier3);
  const cancelTier3  = useAriaStore((s) => s.cancelTier3);

  // Guard — should never render without a tier3Action but be safe
  if (!tier3Action) return null;

  const { action, path, reason } = tier3Action;

  return (
    <motion.div
      id="aria-tier3-panel"
      className="t3-panel"
      role="alertdialog"
      aria-modal="false"
      aria-label="Destructive action confirmation"
      aria-live="assertive"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0,   opacity: 1 }}
      exit={{    y: 140, opacity: 0 }}
      transition={{
        type:      'spring',
        stiffness: 400,
        damping:   35,
      }}
    >
      {/* ── Top row: warning + label + close ── */}
      <div className="t3-top-row">
        <span className="t3-warning-icon" aria-hidden>⚠</span>
        <span className="t3-header-text">ARIA needs permission</span>
        <button
          id="t3-cancel-x-btn"
          className="t3-close-btn"
          onClick={cancelTier3}
          aria-label="Cancel destructive action"
        >
          ✕
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="t3-body">
        {/* Action name */}
        <p className="t3-action-name text-projected">{action}</p>

        {/* Target path — full path in DOM, CSS handles truncation + hover expand */}
        {path && (
          <p className="t3-path" title={path}>
            {path}
          </p>
        )}

        {/* Reason */}
        {reason && (
          <p className="t3-reason">Because: {reason}</p>
        )}
      </div>

      {/* ── Button row ── */}
      <div className="t3-actions">
        <button
          id="t3-cancel-btn"
          className="t3-btn t3-btn--cancel"
          onClick={cancelTier3}
        >
          Cancel
        </button>

        <ConfirmButton actionName={action} onConfirm={confirmTier3} />
      </div>
    </motion.div>
  );
}
