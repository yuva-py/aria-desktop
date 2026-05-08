// src/components/sidebar/tabs/LogsTab.jsx
// Scrollable, filterable action log pulled from ariaStore.logs[].
//
// Entry shape: { timestamp, tool, action, success, summary }
//
// Features:
//   - Filter bar: All | ✓ Success | ✗ Failed | <per-tool chip>
//   - Relative timestamps updated every 10 s
//   - Newest entries at top (logs.slice(-50).reverse())
//   - AnimatePresence with layout prop for insert/filter animations
//   - React.memo on LogEntry for performance
//   - Live count badge in header

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAriaStore from '../../../store/ariaStore';
import { materializeFast } from '../../../animations/materialize';
import ToolPill, { TOOL_COLORS, parseToolId } from '../shared/ToolPill';
import '../shared/ToolPill.css';
import './LogsTab.css';

// ── Relative time helper ───────────────────────────────────────────────────
function relativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const secs   = Math.floor(diffMs / 1000);
  if (secs < 60)   return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60)   return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs  < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Ticker — forces re-render every 10 s for live timestamps ──────────────
function useTick(intervalMs = 10_000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}

// ── Filter chip definitions ────────────────────────────────────────────────
const BASE_CHIPS = [
  { id: 'all',     label: 'All'       },
  { id: 'success', label: '✓ Success' },
  { id: 'failed',  label: '✗ Failed'  },
];

// ── Single log entry (memoised) ────────────────────────────────────────────
const LogEntry = memo(function LogEntry({ entry, tick }) {
  const { timestamp, tool, action, success, summary } = entry;

  return (
    <motion.div
      className="log-entry"
      variants={materializeFast}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Row 1: pill · action · timestamp */}
      <div className="log-entry__row1">
        <ToolPill name={tool} />
        <span className="log-entry__action">{action}</span>
        <span className="log-entry__time">{relativeTime(timestamp)}</span>
      </div>

      {/* Row 2: success/fail icon · summary */}
      <div className="log-entry__row2">
        <span
          className="log-entry__status-icon"
          style={{ color: success ? 'rgba(80,255,160,0.85)' : 'rgba(255,80,80,0.85)' }}
          aria-label={success ? 'success' : 'failed'}
        >
          {success ? '✓' : '✗'}
        </span>
        <span className="log-entry__summary text-projected">{summary}</span>
      </div>
    </motion.div>
  );
});

// ── Filter chip ────────────────────────────────────────────────────────────
function FilterChip({ id, label, active, onClick }) {
  return (
    <motion.button
      variants={materializeFast}
      initial="hidden"
      animate="visible"
      className={`logs-filter-chip${active ? ' logs-filter-chip--active' : ''}`}
      onClick={() => onClick(id)}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  );
}

// ── LogsTab ────────────────────────────────────────────────────────────────
export default function LogsTab() {
  const logs = useAriaStore((s) => s.logs);
  const tick = useTick();

  const [activeFilter, setActiveFilter] = useState('all');

  // Build tool-specific chips from whatever tools actually appear in logs
  const toolChips = useMemo(() => {
    const seen = new Set();
    logs.forEach((e) => {
      const id = parseToolId(e.tool);
      if (!seen.has(id) && TOOL_COLORS[id]) seen.add(id);
    });
    return [...seen].map((id) => ({ id, label: id.replace('_tool', '') }));
  }, [logs]);

  const allChips = [...BASE_CHIPS, ...toolChips];

  // Slice to newest 50, reverse so newest is at top
  const visible = useMemo(() => {
    const sliced = logs.slice(-50).reverse();
    if (activeFilter === 'all')     return sliced;
    if (activeFilter === 'success') return sliced.filter((e) => e.success);
    if (activeFilter === 'failed')  return sliced.filter((e) => !e.success);
    // Tool filter
    return sliced.filter((e) => parseToolId(e.tool) === activeFilter);
  }, [logs, activeFilter]);

  const handleChip = useCallback((id) => setActiveFilter(id), []);

  return (
    <div className="logs-tab">
      {/* ── Header ── */}
      <div className="logs-tab__header">
        <span className="logs-tab__label">LOGS</span>
        {logs.length > 0 && (
          <span className="logs-tab__count-badge">
            {logs.length}
          </span>
        )}
      </div>

      {/* ── Filter bar ── */}
      {logs.length > 0 && (
        <div className="logs-filter-bar" role="group" aria-label="Filter logs">
          {allChips.map((chip) => (
            <FilterChip
              key={chip.id}
              id={chip.id}
              label={chip.label}
              active={activeFilter === chip.id}
              onClick={handleChip}
            />
          ))}
        </div>
      )}

      {/* ── Entry list ── */}
      <div className="logs-tab__list" role="list">
        <AnimatePresence mode="popLayout">
          {visible.length === 0 ? (
            <motion.div
              key="empty"
              className="logs-tab__empty"
              variants={materializeFast}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <span className="text-projected">No actions yet</span>
            </motion.div>
          ) : (
            visible.map((entry, i) => (
              <LogEntry
                key={`${entry.timestamp}-${i}`}
                entry={entry}
                tick={tick}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
