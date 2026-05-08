// src/constants/accentStrategy.js
// Single source of truth for phase-aware spectral accent colours.
//
// Each phase maps to a spectral position on the visible light spectrum:
//   idle        → near-white silver     (no activity)
//   planning    → sky / cyan            (~490 nm, cool analytical)
//   executing   → violet / indigo       (~420 nm, energetic)
//   recovering  → amber / gold          (~590 nm, caution)
//   error       → red / crimson         (~650 nm, alert)
//   complete    → pure white            (resolved, clean)
//   tier3       → deep crimson          (critical / high-stakes)
//
// Shape of each entry:
//   primary   — main accent colour (rgba string)
//   glow      — softer version for box-shadows and halos
//   border    — semi-opaque version for gradient border elements
//   dot       — solid colour for small indicators (dot, pill bg)
//   hue       — approximate hue value for CSS filter:hue-rotate() tricks

export const SPECTRAL_ACCENTS = {
  idle: {
    primary: 'rgba(255, 255, 255, 0.18)',
    glow:    'rgba(255, 255, 255, 0.06)',
    border:  'rgba(255, 255, 255, 0.10)',
    dot:     'rgba(255, 255, 255, 0.35)',
    hue:     0,
  },

  planning: {
    primary: 'rgba(56,  189, 248, 0.92)',   // sky-400  ~200°
    glow:    'rgba(56,  189, 248, 0.28)',
    border:  'rgba(56,  189, 248, 0.50)',
    dot:     'rgba(56,  189, 248, 1.0)',
    hue:     200,
  },

  executing: {
    primary: 'rgba(167, 139, 250, 0.92)',   // violet-400  ~262°
    glow:    'rgba(167, 139, 250, 0.32)',
    border:  'rgba(167, 139, 250, 0.52)',
    dot:     'rgba(167, 139, 250, 1.0)',
    hue:     262,
  },

  recovering: {
    primary: 'rgba(251, 191,  36, 0.92)',   // amber-400  ~43°
    glow:    'rgba(251, 191,  36, 0.30)',
    border:  'rgba(251, 191,  36, 0.52)',
    dot:     'rgba(251, 191,  36, 1.0)',
    hue:     43,
  },

  error: {
    primary: 'rgba(248, 113, 113, 0.92)',   // red-400  ~0°
    glow:    'rgba(248, 113, 113, 0.30)',
    border:  'rgba(248, 113, 113, 0.52)',
    dot:     'rgba(248, 113, 113, 1.0)',
    hue:     0,
  },

  complete: {
    primary: 'rgba(255, 255, 255, 0.92)',
    glow:    'rgba(255, 255, 255, 0.22)',
    border:  'rgba(255, 255, 255, 0.38)',
    dot:     'rgba(255, 255, 255, 1.0)',
    hue:     0,
  },

  tier3: {
    primary: 'rgba(220,  38,  38, 0.92)',   // red-600  ~0°
    glow:    'rgba(220,  38,  38, 0.38)',
    border:  'rgba(220,  38,  38, 0.56)',
    dot:     'rgba(220,  38,  38, 1.0)',
    hue:     350,
  },
};

/**
 * Returns the accent record for a given phase string.
 * Falls back to `idle` for any unknown phase.
 *
 * @param {string} phase
 * @returns {{ primary: string, glow: string, border: string, dot: string, hue: number }}
 */
export function accentForPhase(phase) {
  return SPECTRAL_ACCENTS[phase] ?? SPECTRAL_ACCENTS.idle;
}
