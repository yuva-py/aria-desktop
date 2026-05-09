// src/hooks/useVoiceIO.js
// Voice I/O hook — Speech-to-Text + Text-to-Speech + Wake Word
// Uses the Web Speech API built into Chromium/Electron — no Python packages needed.
//
// STT:  SpeechRecognition → transcripts fill the CommandBar input
// TTS:  SpeechSynthesis   → speaks ARIA's responses aloud
// Wake: Continuous SpeechRecognition in background → triggers activation on
//       hearing "hey aria", "aria", or configurable phrases

import { useEffect, useRef, useCallback } from 'react';
import useSettingsStore from '../store/settingsStore';
import useAriaStore     from '../store/ariaStore';

// ── Browser capability check ──────────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

const synth = window.speechSynthesis || null;

export const voiceSupported = {
  stt:      !!SpeechRecognition,
  tts:      !!synth,
  wakeWord: !!SpeechRecognition,
};

// ── Shared TTS helper (used by the hook and exported for direct use) ──────────
let _ttsUtterance = null;

export function speakText(text, { rate = 1.05, pitch = 1.0, volume = 0.9 } = {}) {
  if (!synth || !text) return;
  // Cancel any in-flight speech
  synth.cancel();
  const utt   = new SpeechSynthesisUtterance(text);
  utt.rate    = rate;
  utt.pitch   = pitch;
  utt.volume  = volume;
  // Prefer a higher-quality English voice if available
  const voices = synth.getVoices();
  const pref   = voices.find(
    (v) => v.lang.startsWith('en') && (v.name.includes('Neural') || v.name.includes('Natural') || v.localService === false)
  ) || voices.find((v) => v.lang.startsWith('en'));
  if (pref) utt.voice = pref;
  _ttsUtterance = utt;
  synth.speak(utt);
}

export function stopSpeaking() {
  synth?.cancel();
}

// ── Wake-word phrases ─────────────────────────────────────────────────────────
const WAKE_PHRASES = ['hey aria', 'aria', 'ok aria', 'yo aria'];

function _containsWakeWord(transcript) {
  const lower = transcript.toLowerCase().trim();
  return WAKE_PHRASES.some((p) => lower.includes(p));
}

// ── Main hook ─────────────────────────────────────────────────────────────────

/**
 * useVoiceIO — drop this in App.jsx alongside useARIAStream.
 *
 * Returns:
 *   startListening(onResult) — start one-shot STT; calls onResult(transcript)
 *   stopListening()          — abort current STT session
 *   isListeningRef           — ref, true while mic is open
 */
export default function useVoiceIO() {
  const sttEnabled      = useSettingsStore((s) => s.sttEnabled);
  const ttsEnabled      = useSettingsStore((s) => s.ttsEnabled);
  const wakeWordEnabled = useSettingsStore((s) => s.wakeWordEnabled);

  // ariaStore exposes setListening so the orb reacts to voice
  const setListening = useAriaStore((s) => s.setListening);

  const sttRef      = useRef(null);   // one-shot STT recognizer
  const wakeRef     = useRef(null);   // continuous wake-word recognizer
  const isListening = useRef(false);

  // ── One-shot STT ─────────────────────────────────────────────────────────
  const startListening = useCallback((onResult) => {
    if (!SpeechRecognition || isListening.current) return;
    if (sttRef.current) { try { sttRef.current.abort(); } catch (_) {} }

    const rec        = new SpeechRecognition();
    rec.lang         = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    sttRef.current   = rec;
    isListening.current = true;
    setListening(true);

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript?.trim() || '';
      if (transcript) onResult(transcript);
    };
    rec.onerror = (e) => {
      console.warn('[useVoiceIO] STT error:', e.error);
    };
    rec.onend = () => {
      isListening.current = false;
      setListening(false);
    };

    try { rec.start(); } catch (e) { console.warn('[useVoiceIO] rec.start():', e); }
  }, [setListening]);

  const stopListening = useCallback(() => {
    try { sttRef.current?.abort(); } catch (_) {}
    isListening.current = false;
    setListening(false);
  }, [setListening]);

  // ── Wake-word listener ───────────────────────────────────────────────────
  useEffect(() => {
    if (!wakeWordEnabled || !SpeechRecognition) return;

    let active = true;

    function startWake() {
      if (!active) return;
      const rec        = new SpeechRecognition();
      rec.lang         = 'en-US';
      rec.continuous   = true;
      rec.interimResults = true;
      wakeRef.current  = rec;

      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (_containsWakeWord(text)) {
            // Pulse the orb briefly
            setListening(true);
            setTimeout(() => setListening(false), 600);
            // Focus the CommandBar input
            document.getElementById('aria-command-input')?.focus();
          }
        }
      };

      rec.onerror  = (e) => { if (e.error !== 'no-speech') console.warn('[wake]', e.error); };
      rec.onend    = () => { if (active) setTimeout(startWake, 500); };  // auto-restart

      try { rec.start(); } catch (_) {}
    }

    startWake();

    return () => {
      active = false;
      try { wakeRef.current?.abort(); } catch (_) {}
    };
  }, [wakeWordEnabled, setListening]);

  // ── TTS: subscribe to ariaStore.lastResponse ────────────────────────────
  // We listen for changes to lastResponse and speak it when ttsEnabled.
  useEffect(() => {
    if (!ttsEnabled || !synth) return;

    // Subscribe to ariaStore directly to catch session_complete responses
    const unsub = useAriaStore.subscribe(
      (state) => state.lastResponse,
      (response) => {
        if (response && ttsEnabled) speakText(response);
      }
    );
    return () => {
      unsub();
      synth.cancel();
    };
  }, [ttsEnabled]);

  // Stop TTS when disabled mid-speech
  useEffect(() => {
    if (!ttsEnabled) synth?.cancel();
  }, [ttsEnabled]);

  return { startListening, stopListening, isListeningRef: isListening };
}
