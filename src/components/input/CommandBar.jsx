// src/components/input/CommandBar.jsx
// Single text input that sends commands to the ARIA stub server.
//
// Behaviour:
//   • Enter key or ▶ button → POST {input} to localhost:7331/process
//   • Escape key            → clear the input
//   • Clears automatically after a successful submit
//
// Visual states:
//   IDLE    – subtle glass pill, muted border, dim prompt glyph
//   FOCUS   – animated spectral gradient ring appears around the pill
//   TYPING  – phase-aware caret & prompt colour, text-active chromatic effect
//   LOADING – spinner replaces button, ring stays visible
//   FLASH   – 300 ms hue-rotate+brightness spectral sweep on submit
//
// Phase awareness:
//   The submit button, prompt glyph, caret, and focused glow all take on
//   the current ARIA phase accent via CSS custom properties injected as
//   inline style on the wrapper:
//     --cmd-accent   (primary colour for button background, prompt, caret)
//     --cmd-glow     (diluted colour for focused box-shadow)
//     --cmd-border   (semi-opaque colour for the focused inner border hint)

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAriaStore      from '../../store/ariaStore';
import useSettingsStore  from '../../store/settingsStore';
import { accentForPhase } from '../../constants/accentStrategy';
import { play as playSound } from '../../sound/ariaSounds';
import './CommandBar.css';

// useVoiceIO is instantiated at App level — access via window ref set there
// (avoids running two recognition sessions from two component instances)
let _voiceIO = null;
export function _registerVoiceIO(api) { _voiceIO = api; }

// ── Minimal inline mic SVG ────────────────────────────────────────────────────
function MicIcon({ active }) {
  return (
    <svg width="11" height="14" viewBox="0 0 11 14" aria-hidden="true" fill="none">
      <rect
        x="2.5" y="0.5" width="6" height="8" rx="3"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor" strokeWidth="1.25"
      />
      <path
        d="M0.5 7a5 5 0 0 0 10 0"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"
      />
      <line x1="5.5" y1="12" x2="5.5" y2="14"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <line x1="3.5" y1="14" x2="7.5" y2="14"
        stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

const PROCESS_URL = 'http://localhost:7331/process';

export default function CommandBar() {
  const [value,    setValue]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [focused,  setFocused]  = useState(false);
  const [flashing, setFlashing] = useState(false);
  const inputRef = useRef(null);

  // ── Phase-aware accent ────────────────────────────────────────────────────
  const phase       = useAriaStore((s) => s.phase);
  const isListening = useAriaStore((s) => s.isListening);
  const accent      = useMemo(() => accentForPhase(phase), [phase]);

  // ── Settings (forwarded to POST /process) ────────────────────────────────
  const model           = useSettingsStore((s) => s.model);
  const strategy        = useSettingsStore((s) => s.strategy);
  const maxSteps        = useSettingsStore((s) => s.maxSteps);

  // ── Voice settings ────────────────────────────────────────────────────────
  const voiceEnabled    = useSettingsStore((s) => s.voiceEnabled);
  const setVoiceEnabled = useSettingsStore((s) => s.setVoiceEnabled);
  const sttEnabled      = useSettingsStore((s) => s.sttEnabled);

  // ── Submit (optionally takes an override text for STT auto-submit) ─────────
  const submit = useCallback(async (overrideText) => {
    const trimmed = (overrideText ?? value).trim();
    if (!trimmed || loading) return;

    // Trigger the spectral-sweep flash animation
    setFlashing(true);
    setTimeout(() => setFlashing(false), 380);

    // Submit sound (Web Audio — no-op when sound is disabled in settings)
    playSound('submit');

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(PROCESS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: trimmed, model, strategy, maxSteps }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setValue('');
    } catch (err) {
      console.error('[CommandBar] POST failed:', err);
      setError('Could not reach ARIA server.');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [value, loading, model, strategy, maxSteps]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter')  { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { setValue(''); setError(null); }
  }, [submit]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isTyping      = focused && value.length > 0;
  const hasContent    = value.length > 0;
  // Mic bars take priority over processing dots when ARIA is listening
  const showMicBars  = isListening && !hasContent;
  const isProcessing = phase !== 'idle' && !hasContent && !showMicBars;

  const wrapperCls = [
    'command-bar__gradient-border',
    focused     ? 'command-bar__gradient-border--focused'   : '',
    flashing    ? 'command-bar__gradient-border--flashing'  : '',
    loading     ? 'command-bar__gradient-border--loading'   : '',
    isListening ? 'command-bar__gradient-border--listening' : '',
  ].filter(Boolean).join(' ');

  const innerCls = [
    'command-bar__inner',
    focused ? 'command-bar__inner--focused' : '',
  ].filter(Boolean).join(' ');

  const inputCls = [
    'command-bar__input',
    'text-projected',
    isTyping ? 'text-active command-bar__input--typing' : '',
  ].filter(Boolean).join(' ');

  // CSS custom properties bridge JS accent → CSS
  const accentVars = {
    '--cmd-accent': accent.primary,
    '--cmd-glow':   accent.glow,
    '--cmd-border': accent.border,
  };

  return (
    <div className="command-bar" role="search" style={accentVars}>
      {/* ── Gradient-border wrapper ── */}
      <div className={wrapperCls}>
        <div className={innerCls}>

          {/* Prompt glyph — phase-tinted; pulses when listening */}
          <motion.span
            className={[
              'command-bar__prompt',
              isTyping    ? 'command-bar__prompt--typing'    : '',
              isListening ? 'command-bar__prompt--listening' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
            animate={{
              opacity: isListening ? 1 : isTyping ? 1 : 0.55,
              scale:   isTyping ? 1.1 : 1,
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            ›
          </motion.span>

          {/* Mic waveform bars — replaces processing dots while listening */}
          <AnimatePresence>
            {showMicBars && (
              <motion.span
                className="command-bar__mic-bars"
                aria-label="Listening"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{    opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <span /><span /><span />
              </motion.span>
            )}
          </AnimatePresence>

          {/* Processing dots when ARIA is active (not listening) */}
          <AnimatePresence>
            {isProcessing && (
              <motion.span
                className="command-bar__processing-dots"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{    opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <span /><span /><span />
              </motion.span>
            )}
          </AnimatePresence>

          <input
            id="aria-command-input"
            ref={inputRef}
            className={inputCls}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={()  => setFocused(false)}
            placeholder={isListening ? 'Listening…' : 'Tell ARIA what to do…'}
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
            aria-label="ARIA command input"
          />

          {/* Mic button — when STT enabled: tap to speak; else toggles mic reactivity */}
          <motion.button
            id="aria-mic-toggle"
            className={[
              'command-bar__mic-btn',
              (voiceEnabled || sttEnabled) ? 'command-bar__mic-btn--active'    : '',
              isListening                  ? 'command-bar__mic-btn--listening' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (sttEnabled && _voiceIO) {
                // STT mode: tap to record, transcript fills input and submits
                if (isListening) {
                  _voiceIO.stopListening();
                } else {
                  _voiceIO.startListening((transcript) => {
                    setValue(transcript);
                    // Auto-submit directly with the transcript so we bypass
                    // the stale closure over `value`
                    setTimeout(() => submit(transcript), 120);
                  });
                }
              } else {
                setVoiceEnabled(!voiceEnabled);
              }
            }}
            aria-label={isListening ? 'Stop listening' : sttEnabled ? 'Start voice input' : voiceEnabled ? 'Disable mic' : 'Enable mic'}
            aria-pressed={voiceEnabled || isListening}
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.90 }}
            animate={{ opacity: isListening ? 1 : (voiceEnabled || sttEnabled) ? 0.72 : 0.30 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <MicIcon active={isListening} />
          </motion.button>

          {/* Submit / spinner button */}
          <motion.button
            id="aria-command-submit"
            className="command-bar__submit"
            onClick={submit}
            disabled={loading || !hasContent}
            aria-label="Send command"
            whileHover={!loading && hasContent ? { scale: 1.1 }  : {}}
            whileTap={  !loading && hasContent ? { scale: 0.92 } : {}}
            animate={{
              opacity: loading || !hasContent ? 0.35 : 1,
            }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {loading ? (
              <span className="command-bar__spinner" aria-hidden="true" />
            ) : (
              <span aria-hidden="true">▶</span>
            )}
          </motion.button>

        </div>
      </div>

      {/* ── Inline error ── */}
      <AnimatePresence>
        {error && (
          <motion.p
            className="command-bar__error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
