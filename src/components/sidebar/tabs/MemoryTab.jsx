// src/components/sidebar/tabs/MemoryTab.jsx
//
// Three-section memory dashboard for the ARIA sidebar:
//   1. Performance Ring  — SVG radial gauge of successRate
//   2. Learned Patterns  — confidence cards with forget action
//   3. Recent Episodes   — expandable session rows
//
// Animation language:
//   • Ring arc animates via CSS @keyframes on strokeDashoffset
//   • Pattern cards use materializeFast with 0.06 s stagger
//   • Episode expand/collapse uses Framer Motion layout + AnimatePresence

import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useMemoryStore from '../../../store/memoryStore';
import { materialize, materializeFast } from '../../../animations/materialize';
import './MemoryTab.css';

// ── Constants ──────────────────────────────────────────────────────────────
const RING_RADIUS      = 40;
const RING_STROKE_W    = 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const MAX_PATTERNS_DEFAULT = 8;

// ── Relative time helper (shared with LogsTab) ─────────────────────────────
function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const secs   = Math.floor(diffMs / 1000);
  if (secs < 60)  return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)  return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label, count }) {
  return (
    <div className="mem-section__header">
      <span className="mem-section__label">{label}</span>
      {count != null && count > 0 && (
        <span className="mem-section__badge">{count}</span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION 1 — Performance Ring
// ──────────────────────────────────────────────────────────────────────────
function PerformanceRing({ metrics }) {
  const { totalGoals = 0, successRate = 0, avgSteps = 0 } = metrics;
  const pct = Math.round(successRate * 100);

  // Arc length for the progress stroke
  const progressDash   = successRate * RING_CIRCUMFERENCE;
  const remainderDash  = RING_CIRCUMFERENCE - progressDash;

  // Unique IDs so multiple instances don't share gradient ids
  const gradId = 'mem-ring-grad';

  return (
    <div className="mem-ring__section">
      <div className="mem-ring__wrapper" aria-label={`Success rate: ${pct}%`}>
        <svg
          className="mem-ring__svg"
          viewBox="0 0 96 96"
          width={96}
          height={96}
          role="img"
        >
          <defs>
            {/* Spectral gradient: violet → cyan → green */}
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="rgba(150,100,255,0.9)" />
              <stop offset="45%"  stopColor="rgba(60,200,255,0.9)"  />
              <stop offset="100%" stopColor="rgba(80,230,120,0.9)"  />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={48}
            cy={48}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={RING_STROKE_W}
          />

          {/* Progress arc — animated via CSS class */}
          <circle
            className="mem-ring__arc"
            cx={48}
            cy={48}
            r={RING_RADIUS}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={RING_STROKE_W}
            strokeLinecap="round"
            strokeDasharray={`${progressDash} ${remainderDash}`}
            /* CSS animation drives offset from RING_CIRCUMFERENCE → 0 */
            style={{
              '--mem-ring-target': `${RING_CIRCUMFERENCE - progressDash}`,
            }}
            transform="rotate(-90 48 48)"
          />
        </svg>

        {/* Center label */}
        <div className="mem-ring__center">
          <span className="mem-ring__pct text-projected">{pct}%</span>
        </div>
      </div>

      {/* Three stats below ring */}
      <div className="mem-ring__stats">
        <span className="mem-ring__stat">{totalGoals} goals</span>
        <span className="mem-ring__stat-sep" aria-hidden>·</span>
        <span className="mem-ring__stat">{pct}% success</span>
        <span className="mem-ring__stat-sep" aria-hidden>·</span>
        <span className="mem-ring__stat">{avgSteps} avg steps</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SECTION 2 — Pattern card
// ──────────────────────────────────────────────────────────────────────────
const PatternCard = memo(function PatternCard({ pattern, onForget }) {
  const { intent, count, confidence } = pattern;
  const pct = Math.round((confidence ?? 0) * 100);

  return (
    <motion.div
      className="mem-pattern__card"
      variants={materializeFast}
      layout
    >
      {/* Row 1: intent + confidence bar */}
      <div className="mem-pattern__row1">
        <span className="mem-pattern__intent" title={intent}>{intent}</span>
        <div className="mem-pattern__conf-track" aria-label={`Confidence ${pct}%`}>
          <div
            className="mem-pattern__conf-fill"
            style={{ '--conf-w': `${pct}%` }}
          />
        </div>
      </div>

      {/* Row 2: seen count + forget */}
      <div className="mem-pattern__row2">
        <span className="mem-pattern__count">{count}x seen</span>
        <button
          className="mem-pattern__forget"
          onClick={() => onForget(intent)}
          aria-label={`Forget pattern: ${intent}`}
        >
          Forget
        </button>
      </div>
    </motion.div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// SECTION 3 — Episode row (expandable)
// ──────────────────────────────────────────────────────────────────────────
const EpisodeRow = memo(function EpisodeRow({ episode }) {
  const [expanded, setExpanded] = useState(false);
  const { timestamp, goal, success, steps } = episode;

  return (
    <motion.div
      className="mem-episode__row"
      layout
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded((v) => !v); }}
    >
      {/* Collapsed summary */}
      <div className="mem-episode__summary">
        {/* Success / fail dot */}
        <span
          className="mem-episode__dot"
          style={{
            background: success
              ? 'rgba(80,255,160,0.8)'
              : 'rgba(255,80,80,0.8)',
          }}
          aria-label={success ? 'success' : 'failed'}
        />
        <span className="mem-episode__goal" title={goal}>{goal}</span>
        <span className="mem-episode__time">{relativeTime(timestamp)}</span>
        <span className="mem-episode__chevron" aria-hidden>
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="mem-episode__detail"
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <p className="mem-episode__full-goal">{goal}</p>
            <div className="mem-episode__meta">
              <span className="mem-episode__meta-item">
                {steps} step{steps !== 1 ? 's' : ''}
              </span>
              <span className="mem-episode__meta-sep" aria-hidden>·</span>
              <span
                className="mem-episode__meta-item"
                style={{ color: success ? 'rgba(80,255,160,0.8)' : 'rgba(255,80,80,0.8)' }}
              >
                {success ? 'Success' : 'Failed'}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// Root — MemoryTab
// ──────────────────────────────────────────────────────────────────────────
export default function MemoryTab() {
  const patterns   = useMemoryStore((s) => s.patterns);
  const metrics    = useMemoryStore((s) => s.metrics);
  const episodes   = useMemoryStore((s) => s.episodes);
  const removePattern = useMemoryStore((s) => s.removePattern);

  const [showAll, setShowAll] = useState(false);

  // Last 5 episodes, newest first
  const recentEpisodes = episodes.slice().reverse().slice(0, 5);

  // Cap patterns at 8 unless "show more" toggled
  const visiblePatterns = showAll ? patterns : patterns.slice(0, MAX_PATTERNS_DEFAULT);
  const hasMore = patterns.length > MAX_PATTERNS_DEFAULT;

  const handleForget = useCallback(
    (intent) => removePattern?.(intent),
    [removePattern],
  );

  return (
    <motion.div
      className="mem-tab"
      variants={materialize}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* ── § 1  Performance Ring ─────────────────────────────── */}
      <PerformanceRing metrics={metrics} />

      {/* ── § 2  Learned Patterns ─────────────────────────────── */}
      <section className="mem-section" aria-label="Learned patterns">
        <SectionHeader label="PATTERNS" count={patterns.length} />

        {patterns.length === 0 ? (
          <div className="mem-empty">
            <span className="text-projected">
              ARIA hasn't learned any patterns yet
            </span>
          </div>
        ) : (
          <>
            <motion.div
              className="mem-pattern__list"
              variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {visiblePatterns.map((p) => (
                  <PatternCard
                    key={p.intent}
                    pattern={p}
                    onForget={handleForget}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {hasMore && (
              <button
                className="mem-pattern__show-more"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? `Show less`
                  : `Show ${patterns.length - MAX_PATTERNS_DEFAULT} more`}
              </button>
            )}
          </>
        )}
      </section>

      {/* ── § 3  Recent Episodes ──────────────────────────────── */}
      <section className="mem-section" aria-label="Recent sessions">
        <SectionHeader label="RECENT SESSIONS" />

        {recentEpisodes.length === 0 ? (
          <div className="mem-empty">
            <span className="text-projected">No sessions recorded</span>
          </div>
        ) : (
          <div className="mem-episode__list">
            <AnimatePresence>
              {recentEpisodes.map((ep, i) => (
                <EpisodeRow
                  key={`${ep.timestamp}-${i}`}
                  episode={ep}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>
    </motion.div>
  );
}
