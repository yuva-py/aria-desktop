// src/animations/materialize.js
// Framer Motion variants for ARIA's "materialization" motion language.
//
// Philosophy:
//   Elements don't slide in from off-screen — they condense out of
//   unfocused blur+oversaturation into sharp, present reality.
//   Exit is the reverse: they lose saturation (bleach out) and blur away.
//
// Variants exported:
//   materialize       — standard panel / modal level (400 ms enter)
//   materializeFast   — list items, chips, small elements (250 ms enter)
//   materializeSidebar — sidebar panel (subtle x shift + deep blur)
//   materializeStagger — container that staggers children using materializeFast


// ── materialize — full panel / large element ────────────────────────────────
export const materialize = {
  hidden: {
    opacity: 0,
    filter:  'blur(10px) saturate(2)',
    scale:   0.97,
  },
  visible: {
    opacity: 1,
    filter:  'blur(0px) saturate(1)',
    scale:   1,
    transition: {
      duration: 0.4,
      ease:     [0.16, 1, 0.3, 1],     // spring-like overshoot ease
      filter:   { duration: 0.5 },      // filter disperses slightly slower
      opacity:  { duration: 0.35 },
    },
  },
  exit: {
    opacity: 0,
    filter:  'blur(5px) saturate(0)',
    scale:   1.01,
    transition: { duration: 0.25, ease: 'easeIn' },
  },
};


// ── materializeFast — list items, pills, small UI pieces ────────────────────
export const materializeFast = {
  hidden: {
    opacity: 0,
    filter:  'blur(8px) saturate(2)',
    scale:   0.97,
  },
  visible: {
    opacity: 1,
    filter:  'blur(0px) saturate(1)',
    scale:   1,
    transition: {
      duration: 0.25,
      ease:     [0.16, 1, 0.3, 1],
      filter:   { duration: 0.3 },
    },
  },
  exit: {
    opacity: 0,
    filter:  'blur(4px) saturate(0)',
    scale:   1.01,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};


// ── materializeSidebar — the sidebar panel itself ───────────────────────────
// The sidebar element has backdrop-filter: blur() in CSS.  On Windows Electron
// transparent windows, applying CSS filter (even filter:blur) on the SAME
// element that has backdrop-filter causes a GPU compositor crash.
// Safe alternative: use only opacity, x, and scale — no filter property at all.
export const materializeSidebar = {
  hidden: {
    x:       -22,
    opacity: 0,
    scale:   0.975,
  },
  visible: {
    x:       0,
    opacity: 1,
    scale:   1,
    transition: {
      opacity: { duration: 0.28, ease: 'easeOut' },
      scale:   { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
      x:       { type: 'spring', stiffness: 300, damping: 26 },
    },
  },
  exit: {
    x:       -14,
    opacity: 0,
    scale:   1.008,
    transition: {
      duration: 0.2,
      ease:     'easeIn',
    },
  },
};


// ── materializeStagger — container for staggered child lists ────────────────
// Use this on the wrapping motion.div; children should use materializeFast.
// The container itself fades in instantly (opacity transition only) while
// orchestrating the stagger timing for children.
export const materializeStagger = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      // Container appears immediately
      duration:       0.01,
      // Children stagger with 70 ms between each
      staggerChildren:  0.07,
      delayChildren:    0.06,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration:         0.1,
      staggerChildren:  0.04,
      staggerDirection: -1,  // reverse stagger on exit (last item exits first)
    },
  },
};
