// src/components/sidebar/shared/ToolPill.jsx
// Shared coloured badge used by PipelineTab and LogsTab.
//
// Props:
//   name {string} — tool id, optionally with "·action" suffix
//                   e.g. "browser_tool" or "browser_tool·navigate"

import React from 'react';

// ── Tool colour map ────────────────────────────────────────────────────────
export const TOOL_COLORS = {
  browser_tool: { bg: 'rgba(120, 80,255,0.25)', color: 'rgba(180,150,255,1)' },
  file_tool:    { bg: 'rgba(255,160,  0,0.25)', color: 'rgba(255,200, 80,1)' },
  system_tool:  { bg: 'rgba(  0,180,255,0.25)', color: 'rgba( 80,210,255,1)' },
  code_tool:    { bg: 'rgba( 80,255,120,0.25)', color: 'rgba(100,255,150,1)' },
};
const DEFAULT_TOOL = { bg: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' };

/**
 * Returns the canonical tool id from a "tool·action" string.
 * @param {string} name
 * @returns {string}
 */
export function parseToolId(name) {
  return name.split('·')[0].trim();
}

export default function ToolPill({ name }) {
  const parts   = name.split('·').map((s) => s.trim());
  const toolId  = parts[0];
  const action  = parts[1] ?? '';
  const colours = TOOL_COLORS[toolId] ?? DEFAULT_TOOL;

  return (
    <span
      className="tool-pill"
      style={{ background: colours.bg, color: colours.color }}
    >
      {toolId}
      {action && <span className="tool-pill__action"> · {action}</span>}
    </span>
  );
}
