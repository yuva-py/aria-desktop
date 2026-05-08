// src/sound/ariaSounds.js
// Web Audio API tone generator + master AnalyserNode for audio reactivity.
//
// All oscillators/gains route through a single master gain → analyser → destination
// chain so useAudioReactivity can read real-time amplitude without re-creating the
// AudioContext each time.
//
// Public API:
//   play(name)            — 'submit' | 'response' | 'error' | 'tier3' | 'complete'
//   getAudioContext()     — shared AudioContext (null if unavailable)
//   getMasterAnalyser()   — AnalyserNode, null until first sound plays
//   getIsSpeaking()       — true while a synth sound is active

import useSettingsStore from '../store/settingsStore';

// ── Singleton AudioContext + master chain ───────────────────────────────────
let _ctx      = null;   // AudioContext
let _analyser = null;   // AnalyserNode  (master)
let _master   = null;   // GainNode before analyser

// ── Speaking flag ───────────────────────────────────────────────────────────
let _isSpeaking   = false;
let _speakingTimer = null;

// ── Context factory ─────────────────────────────────────────────────────────
function getCtx() {
  if (_ctx) return _ctx;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    _ctx = new Ctor();
  } catch (err) {
    console.warn('[ariaSounds] AudioContext unavailable:', err);
    _ctx = null;
  }
  return _ctx;
}

// Lazily build:  tones → _master → _analyser → ctx.destination
function getDestination(ctx) {
  if (!_analyser) {
    _analyser = ctx.createAnalyser();
    _analyser.fftSize = 256;
    _analyser.smoothingTimeConstant = 0.75;
    _master = ctx.createGain();
    _master.gain.value = 1.0;
    _master.connect(_analyser);
    _analyser.connect(ctx.destination);
  }
  return _master;
}

function ensureRunning(ctx) {
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// ── Exported getters ────────────────────────────────────────────────────────

/** Returns the singleton AudioContext, or null if unavailable. */
export function getAudioContext() { return getCtx(); }

/** Returns the master AnalyserNode once at least one sound has played. */
export function getMasterAnalyser() { return _analyser; }

/** True while a synthesised sound is actively playing. */
export function getIsSpeaking() { return _isSpeaking; }

// ── Internal: mark ARIA as speaking for durationMs ─────────────────────────
function markSpeaking(durationMs) {
  _isSpeaking = true;
  clearTimeout(_speakingTimer);
  _speakingTimer = setTimeout(() => { _isSpeaking = false; }, durationMs);
}

// ── Envelope helper ─────────────────────────────────────────────────────────
function envelope(gainNode, ctx, peak, attack, release) {
  const t0 = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(t0);
  gainNode.gain.setValueAtTime(0.0001, t0);
  gainNode.gain.linearRampToValueAtTime(peak, t0 + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
}

// Build osc → gain → master chain.
function tone(ctx, freq, type, peak, attack, release, freqRamp = null) {
  const dst  = getDestination(ctx);
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  if (freqRamp) {
    freqRamp.forEach(([t, v]) =>
      osc.frequency.linearRampToValueAtTime(v, ctx.currentTime + t),
    );
  }

  osc.connect(gain);
  gain.connect(dst);
  envelope(gain, ctx, peak, attack, release);
  osc.start();
  osc.stop(ctx.currentTime + attack + release + 0.05);
  return { osc, gain };
}

// ── Individual sounds ───────────────────────────────────────────────────────

function playSubmit() {
  const ctx = getCtx(); if (!ctx) return;
  ensureRunning(ctx);
  markSpeaking(200);
  tone(ctx, 1200, 'sine', 0.16, 0.005, 0.10);
  tone(ctx, 2400, 'sine', 0.05, 0.005, 0.06);
}

function playResponse() {
  const ctx = getCtx(); if (!ctx) return;
  ensureRunning(ctx);
  markSpeaking(280);
  tone(ctx, 400, 'sine', 0.10, 0.008, 0.16);
  tone(ctx, 600, 'sine', 0.08, 0.008, 0.16);
  tone(ctx, 800, 'sine', 0.06, 0.008, 0.16);
}

function playError() {
  const ctx = getCtx(); if (!ctx) return;
  ensureRunning(ctx);
  markSpeaking(220);
  tone(ctx, 600, 'triangle', 0.18, 0.005, 0.12, [[0.12, 400]]);
}

function playTier3() {
  const ctx = getCtx(); if (!ctx) return;
  ensureRunning(ctx);
  markSpeaking(650);

  const dst      = getDestination(ctx);
  const osc      = ctx.createOscillator();
  const gain     = ctx.createGain();
  const delay    = ctx.createDelay();
  const feedback = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  delay.delayTime.value = 0.06;
  feedback.gain.value   = 0.45;

  osc.connect(gain);
  gain.connect(dst);
  gain.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  feedback.connect(dst);

  envelope(gain, ctx, 0.22, 0.012, 0.20);
  osc.start();
  osc.stop(ctx.currentTime + 0.55);
}

function playComplete() {
  const ctx = getCtx(); if (!ctx) return;
  ensureRunning(ctx);
  markSpeaking(350);
  tone(ctx, 800, 'sine', 0.14, 0.005, 0.18, [
    [0.06, 1200],
    [0.18, 1600],
  ]);
}

// ── Public API ──────────────────────────────────────────────────────────────
const SOUNDS = {
  submit:   playSubmit,
  response: playResponse,
  error:    playError,
  tier3:    playTier3,
  complete: playComplete,
};

/**
 * Play a named sound. No-op when sound is disabled in settings or when the
 * AudioContext can't be created. Safe to call from anywhere.
 *
 * @param {'submit'|'response'|'error'|'tier3'|'complete'} name
 */
export function play(name) {
  if (!useSettingsStore.getState().soundEnabled) return;
  const fn = SOUNDS[name];
  if (fn) fn();
}

export default { play };
