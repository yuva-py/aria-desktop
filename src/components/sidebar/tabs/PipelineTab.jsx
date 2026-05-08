// src/components/sidebar/tabs/PipelineTab.jsx
// Renders ariaStore.goals[] as a vertical node chain.
//
// Each node has:
//   - Status indicator (hollow / pulsing accent / green / red)
//   - Goal text truncated to 200px with .text-projected
//   - Active: current tool pill beneath
//   - Failed: "↻ recovering" in amber
//   - Staggered materializeFast entry animation
//
// Accent colours come from accentStrategy (single source of truth).

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAriaStore         from '../../../store/ariaStore';
import { materializeFast } from '../../../animations/materialize';
import { accentForPhase }   from '../../../constants/accentStrategy';
import ToolPill             from '../shared/ToolPill';
import '../shared/ToolPill.css';

// ── Pulse keyframe injected once via a <style> tag ─────────────────────────
const PULSE_STYLE = `
@keyframes pipeline-pulse {
  0%, 100% { transform: scale(1);    box-shadow: var(--pulse-shadow); }
  50%       { transform: scale(1.22); box-shadow: var(--pulse-shadow-peak); }
}
.pipeline-node__dot--active {
  animation: pipeline-pulse 1.6s ease-in-out infinite;
}`;

let styleInjected = false;
function injectPulseStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = PULSE_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

// ── Single Goal Node ───────────────────────────────────────────────────────
function GoalNode({ goal, phase, currentTool, isLast, index }) {
  React.useEffect(() => { injectPulseStyle(); }, []);

  const accent = useMemo(() => accentForPhase(phase), [phase]);

  // Track tool changes for the dispatch flash
  const prevToolRef  = useRef(currentTool);
  const [pillFlash, setPillFlash] = useState(false);
  useEffect(() => {
    if (goal.status === 'active' && currentTool && currentTool !== prevToolRef.current) {
      setPillFlash(true);
      const id = setTimeout(() => setPillFlash(false), 220);
      return () => clearTimeout(id);
    }
    prevToolRef.current = currentTool;
  }, [currentTool, goal.status]);

  // Track success transitions for the burst animation
  const prevStatusRef  = useRef(goal.status);
  const [burstDot, setBurstDot] = useState(false);
  useEffect(() => {
    if (prevStatusRef.current !== 'success' && goal.status === 'success') {
      setBurstDot(true);
      const id = setTimeout(() => setBurstDot(false), 450);
      return () => clearTimeout(id);
    }
    prevStatusRef.current = goal.status;
  }, [goal.status]);

  // Dot appearance depends on goal status
  let dotStyle = {};
  let dotClass = 'pipeline-node__dot';

  if (goal.status === 'pending') {
    dotStyle = {
      background: 'transparent',
      border:     '1.5px solid rgba(255, 255, 255, 0.22)',
    };
  } else if (goal.status === 'active') {
    dotStyle = {
      background:             accent.dot,
      '--pulse-shadow':       `0 0 6px  ${accent.glow}`,
      '--pulse-shadow-peak':  `0 0 14px ${accent.primary}`,
    };
    dotClass += ' pipeline-node__dot--active';
  } else if (goal.status === 'success') {
    dotStyle = { background: 'rgba(80, 255, 160, 0.88)' };
    if (burstDot) dotClass += ' pipeline-node__dot--burst';
  } else if (goal.status === 'failed') {
    dotStyle = { background: 'rgba(255, 80, 80, 0.88)' };
  }

  // Node wrapper class — active class enables the signal pulse on the line
  const nodeClass = [
    'pipeline-node',
    goal.status === 'active' ? 'pipeline-node--active' : '',
  ].filter(Boolean).join(' ');

  return (
    <motion.div
      className={nodeClass}
      variants={materializeFast}
      initial="hidden"
      animate="visible"
      exit="exit"
      custom={index}
      transition={{ delay: index * 0.07 }}
    >
      {/* ── Left column: connector + dot ── */}
      <div className="pipeline-node__track">
        {!isLast && <div className="pipeline-node__line" />}
        <div
          className={dotClass}
          style={dotStyle}
          aria-label={`Goal ${goal.index + 1}: ${goal.status}`}
        />
      </div>

      {/* ── Right column: text content ── */}
      <div className="pipeline-node__content">
        <p
          className="pipeline-node__text text-projected"
          title={goal.text}
        >
          {goal.text}
        </p>

        {goal.status === 'active' && currentTool && (
          <div className="pipeline-node__tool-row">
            <span className="pipeline-node__arrow">→</span>
            <span className={pillFlash ? 'tool-pill--flash' : ''}>
              <ToolPill name={currentTool} />
            </span>
          </div>
        )}

        {goal.status === 'failed' && (
          <p className="pipeline-node__recovering">↻ recovering</p>
        )}
      </div>
    </motion.div>
  );
}

// ── PipelineTab ────────────────────────────────────────────────────────────
export default function PipelineTab() {
  const goals       = useAriaStore((s) => s.goals);
  const phase       = useAriaStore((s) => s.phase);
  const currentTool = useAriaStore((s) => s.currentTool);

  const activeCount = goals.filter(
    (g) => g.status === 'active' || g.status === 'success'
  ).length;
  const totalCount  = goals.length;
  const showCounter = phase !== 'idle' && totalCount > 0;

  return (
    <div className="pipeline-tab">
      {/* ── Header ── */}
      <div className="pipeline-tab__header">
        <span className="pipeline-tab__label">PIPELINE</span>
        {showCounter && (
          <span className="pipeline-tab__counter">
            {activeCount} / {totalCount}
          </span>
        )}
      </div>

      {/* ── Node chain ── */}
      <div className="pipeline-tab__nodes" role="list">
        <AnimatePresence mode="popLayout">
          {phase === 'idle' || goals.length === 0 ? (
            <motion.div
              key="empty"
              className="pipeline-tab__empty"
              variants={materializeFast}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <p className="text-projected">Waiting for command</p>
            </motion.div>
          ) : (
            goals.map((goal, i) => (
              <GoalNode
                key={goal.index}
                goal={goal}
                phase={phase}
                currentTool={currentTool}
                isLast={i === goals.length - 1}
                index={i}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
