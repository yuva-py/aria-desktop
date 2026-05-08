// src/hooks/useAudioReactivity.js
//
// Real-time audio amplitude from two sources:
//   TTS output — reads the master AnalyserNode that all ariaSounds.js tones
//                route through.  Reflects ARIA "speaking" loudness.
//   Microphone  — getUserMedia stream when voiceEnabled in settingsStore.
//                Reflects the user's voice loudness.
//
// ── Architecture ────────────────────────────────────────────────────────────
//   audioState (module-level) — Three.js useFrame loops import and read this
//                               every frame with zero React re-renders.
//
//   ariaStore  isListening / isSpeaking — React UI subscribes to these booleans
//                                         which flip infrequently.
//
//   CSS custom properties — written from the RAF loop:
//     --mic-amplitude   0.000–1.000   drives CommandBar ring opacity
//     --tts-amplitude   0.000–1.000
//     --cmd-dots-dur    animation-duration for processing dots (faster at peak)
//
// Call this hook once, at the top of App.jsx.

import { useEffect, useRef } from 'react';
import useAriaStore     from '../store/ariaStore';
import useSettingsStore from '../store/settingsStore';
import { getAudioContext, getMasterAnalyser, getIsSpeaking }
  from '../sound/ariaSounds';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level shared state — read by Three.js useFrame (no re-renders)
// ─────────────────────────────────────────────────────────────────────────────
export const audioState = {
  ttsAmplitude:      0,
  micAmplitude:      0,
  combinedAmplitude: 0,
  isListening:       false,
  isSpeaking:        false,
};

// ── Persistent mic objects (survive React re-renders) ──────────────────────
let _micStream   = null;
let _micAnalyser = null;
let _micData     = null;

// ── Data arrays (lazily allocated once analyser exists) ───────────────────
let _ttsData = null;

// ── Exponentially smoothed values (0.15 factor → ~Jarvis weighted feel) ──
let _sTts = 0;   // smoothed TTS amplitude
let _sMic = 0;   // smoothed mic amplitude

// ─────────────────────────────────────────────────────────────────────────────
export default function useAudioReactivity() {
  const voiceEnabled  = useSettingsStore((s) => s.voiceEnabled);
  const setListening  = useAriaStore((s) => s.setListening);
  const setSpeaking   = useAriaStore((s) => s.setSpeaking);

  const rafRef        = useRef(null);
  const prevListen    = useRef(false);
  const prevSpeak     = useRef(false);

  // ── Mic lifecycle: open stream when voice enabled, close when disabled ──
  useEffect(() => {
    if (voiceEnabled && !_micStream) {
      navigator.mediaDevices
        .getUserMedia({ audio: true, video: false })
        .then((stream) => {
          _micStream = stream;
          // Reuse the shared AudioContext so all nodes stay in one graph
          const ctx =
            getAudioContext() ??
            new (window.AudioContext || window.webkitAudioContext)();
          const src = ctx.createMediaStreamSource(stream);
          _micAnalyser = ctx.createAnalyser();
          _micAnalyser.fftSize = 256;
          _micAnalyser.smoothingTimeConstant = 0.80;
          src.connect(_micAnalyser);  // does NOT connect to destination — silent
          _micData = new Uint8Array(_micAnalyser.frequencyBinCount);
        })
        .catch((err) => {
          console.warn('[useAudioReactivity] mic access denied:', err);
        });
    }

    if (!voiceEnabled && _micStream) {
      _micStream.getTracks().forEach((t) => t.stop());
      _micStream   = null;
      _micAnalyser = null;
      _micData     = null;
      _sMic        = 0;
    }
  }, [voiceEnabled]);

  // ── RAF amplitude sampling loop — always running ────────────────────────
  useEffect(() => {
    function tick() {
      // ── TTS amplitude ────────────────────────────────────────────────────
      const ttsAn = getMasterAnalyser();
      let rawTts = 0;
      if (ttsAn) {
        if (!_ttsData) _ttsData = new Uint8Array(ttsAn.frequencyBinCount);
        ttsAn.getByteFrequencyData(_ttsData);
        let sum = 0;
        for (let i = 0; i < _ttsData.length; i++) sum += _ttsData[i];
        rawTts = sum / (_ttsData.length * 255);
      }
      _sTts += (rawTts - _sTts) * 0.15;

      // ── Mic amplitude ────────────────────────────────────────────────────
      let rawMic = 0;
      if (_micAnalyser && _micData) {
        _micAnalyser.getByteFrequencyData(_micData);
        let sum = 0;
        for (let i = 0; i < _micData.length; i++) sum += _micData[i];
        rawMic = sum / (_micData.length * 255);
      }
      _sMic += (rawMic - _sMic) * 0.15;

      // ── Derive states ────────────────────────────────────────────────────
      const isSpeaking  = getIsSpeaking();
      // "Listening" = voice on, ARIA not speaking, mic above noise floor
      const isListening = voiceEnabled && !isSpeaking && _sMic > 0.018;

      // ── Write module-level state (Three.js reads this — no re-renders) ──
      audioState.ttsAmplitude      = _sTts;
      audioState.micAmplitude      = _sMic;
      audioState.combinedAmplitude = Math.max(_sTts, _sMic);
      audioState.isListening       = isListening;
      audioState.isSpeaking        = isSpeaking;

      // ── CSS custom properties ─────────────────────────────────────────────
      // CommandBar ring opacity and dots speed react through pure CSS.
      document.documentElement.style.setProperty(
        '--mic-amplitude', _sMic.toFixed(3));
      document.documentElement.style.setProperty(
        '--tts-amplitude', _sTts.toFixed(3));
      // Dots animate faster at high TTS amplitude (0.40 s floor, 1.20 s default)
      const dotsDur = Math.max(0.40, 1.20 - _sTts * 0.80);
      document.documentElement.style.setProperty(
        '--cmd-dots-dur', `${dotsDur.toFixed(2)}s`);

      // ── ariaStore: only on boolean flip (avoids render cascade) ──────────
      if (isListening !== prevListen.current) {
        prevListen.current = isListening;
        setListening(isListening);
      }
      if (isSpeaking !== prevSpeak.current) {
        prevSpeak.current = isSpeaking;
        setSpeaking(isSpeaking);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // voiceEnabled in deps so isListening check uses fresh value after toggle
  }, [voiceEnabled, setListening, setSpeaking]);
}
