// src/components/orb/OrbStateMapper.js
// Pure mapping function: phase + currentTool → ShaderMaterial uniform values.
// No React, no Three.js — just plain JS so it can be unit-tested in isolation.

// ── Tool → executing colour ───────────────────────────────────────────────────
const TOOL_COLORS = {
  browser_tool: [0.55, 0.35, 0.95], // violet
  file_tool:    [0.95, 0.65, 0.10], // amber
  system_tool:  [0.10, 0.85, 0.90], // cyan
  code_tool:    [0.20, 0.90, 0.45], // green
};

function executingColor(currentTool) {
  // Match by prefix so 'browser_tool', 'browser', etc. all resolve
  const key = Object.keys(TOOL_COLORS).find(
    (k) => currentTool && currentTool.toLowerCase().startsWith(k.replace('_tool', ''))
  );
  return TOOL_COLORS[key] ?? [0.25, 0.55, 1.0]; // default blue
}

// ── Pulse speed constants ─────────────────────────────────────────────────────
const PULSE = {
  slow:        0.6,
  medium:      1.4,
  fast:        2.8,
  instant:     8.0,  // effectively no animation delay
  erratic:     0.3,  // deliberately off-beat for recovering
  slowHeavy:   0.45, // tier3: ominous throb
};

// ── State table ───────────────────────────────────────────────────────────────
const STATE_MAP = {
  idle: {
    uStateColor:            [0.40, 0.30, 0.80],
    uIntensity:             0.75,   // was 0.3 — raised so orb is visible without Bloom
    uPulseSpeed:            PULSE.slow,
    uIridescenceStrength:   1.0,    // was 0.6 — full iridescence at rest
    uDistortion:            0.02,
  },
  planning: {
    uStateColor:            [0.20, 0.50, 1.00],
    uIntensity:             0.85,   // was 0.6
    uPulseSpeed:            PULSE.medium,
    uIridescenceStrength:   1.0,    // was 0.8
    uDistortion:            0.05,
  },
  // executing is built dynamically from currentTool (see getOrbUniforms)
  recovering: {
    uStateColor:            [1.00, 0.50, 0.10],
    uIntensity:             0.85,   // was 0.7
    uPulseSpeed:            PULSE.erratic,
    uIridescenceStrength:   0.8,    // was 0.5
    uDistortion:            0.12,
  },
  error: {
    uStateColor:            [0.90, 0.10, 0.20],
    uIntensity:             1.0,    // was 0.9
    uPulseSpeed:            PULSE.fast,
    uIridescenceStrength:   0.7,    // was 0.3
    uDistortion:            0.15,
  },
  complete: {
    uStateColor:            [1.00, 1.00, 1.00],
    uIntensity:             1.0,
    uPulseSpeed:            PULSE.instant,
    uIridescenceStrength:   1.0,
    uDistortion:            0.01,
  },
  tier3: {
    uStateColor:            [0.80, 0.10, 0.10],
    uIntensity:             1.0,    // was 0.95
    uPulseSpeed:            PULSE.slowHeavy,
    uIridescenceStrength:   0.6,    // was 0.2
    uDistortion:            0.20,
  },
};

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Returns the full set of uniform values for the orb shader.
 *
 * @param {string} phase       - One of: idle | planning | executing |
 *                               recovering | error | complete | tier3
 * @param {string} currentTool - Tool name active during 'executing' phase.
 *                               Ignored for all other phases.
 * @returns {{
 *   uStateColor:           [number, number, number],
 *   uIntensity:            number,
 *   uPulseSpeed:           number,
 *   uIridescenceStrength:  number,
 *   uDistortion:           number,
 * }}
 */
export function getOrbUniforms(phase, currentTool = '') {
  if (phase === 'executing') {
    return {
      uStateColor:           executingColor(currentTool),
      uIntensity:            1.0,   // was 0.8
      uPulseSpeed:           PULSE.fast,
      uIridescenceStrength:  1.0,
      uDistortion:           0.08,
    };
  }

  // Fallback to idle for any unrecognised phase string
  return STATE_MAP[phase] ?? STATE_MAP.idle;
}
