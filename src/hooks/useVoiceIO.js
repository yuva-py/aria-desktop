// src/hooks/useVoiceIO.js  — Production Voice I/O
// ──────────────────────────────────────────────────────────────────────────────
// Architecture:
//   STT: getUserMedia → MediaRecorder → VAD (amplitude silence detection)
//        → WebM blob → AudioContext.decodeAudioData → 16kHz PCM WAV bytes
//        → POST /stt → transcript → CommandBar auto-fill + submit
//
//   TTS: speechSynthesis.speak() on session_complete (lastResponse change)
//        No network required — uses Chromium's built-in synthesis.
//
//   Wake: continuous SpeechRecognition (if available) with exponential
//         backoff restart on error. Falls back gracefully when offline.
//
// Exports:
//   default  useVoiceIO()      — hook, mount once in App.jsx
//   startListening(cb)         — begin VAD recording; cb(transcript) when done
//   stopListening()            — abort current recording
//   updateVAD(micAmplitude)    — call every RAF tick (from useAudioReactivity)
//   speakText(text)            — speak a string via TTS
//   stopSpeaking()             — cancel in-flight TTS
//   voiceSupported             — { stt, tts, wakeWord } capability flags
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import useSettingsStore from '../store/settingsStore';
import useAriaStore     from '../store/ariaStore';

// ── Constants ─────────────────────────────────────────────────────────────────
const STT_URL        = 'http://localhost:7331/stt';
const VAD_THRESHOLD  = 0.020;    // mic amplitude (0–1) above this = speech
const VAD_SILENCE_MS = 1500;     // ms of silence → auto stop & transcribe
const MAX_RECORD_MS  = 12_000;   // hard cap per utterance
const WAKE_PHRASES   = ['hey aria', 'aria', 'ok aria', 'yo aria', 'hey area'];

// ── Capability flags ──────────────────────────────────────────────────────────
const _SpeechRec =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
    : null;

const _synth =
  typeof window !== 'undefined' ? (window.speechSynthesis || null) : null;

export const voiceSupported = {
  stt:      typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
  tts:      !!_synth,
  wakeWord: !!_SpeechRec,
};

// ─────────────────────────────────────────────────────────────────────────────
// WAV encoder
// ─────────────────────────────────────────────────────────────────────────────

function _writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function _encodeWAV(audioBuffer) {
  const sampleRate    = audioBuffer.sampleRate;
  const numSamples    = audioBuffer.length;
  const bitsPerSample = 16;
  const numChannels   = 1;
  const byteRate      = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign    = numChannels * bitsPerSample / 8;
  const dataSize      = numSamples * blockAlign;
  const buf           = new ArrayBuffer(44 + dataSize);
  const view          = new DataView(buf);

  _writeString(view, 0,  'RIFF');
  view.setUint32(4,  36 + dataSize,  true);
  _writeString(view, 8,  'WAVE');
  _writeString(view, 12, 'fmt ');
  view.setUint32(16, 16,             true);
  view.setUint16(20, 1,              true);   // PCM
  view.setUint16(22, numChannels,    true);
  view.setUint32(24, sampleRate,     true);
  view.setUint32(28, byteRate,       true);
  view.setUint16(32, blockAlign,     true);
  view.setUint16(34, bitsPerSample,  true);
  _writeString(view, 36, 'data');
  view.setUint32(40, dataSize,       true);

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = ch1 ? (ch0[i] + ch1[i]) / 2 : ch0[i];
    view.setInt16(offset, Math.max(-32768, Math.min(32767, Math.round(s * 32767))), true);
    offset += 2;
  }
  return buf;
}

async function _resampleTo16k(buffer) {
  if (buffer.sampleRate === 16_000) return buffer;
  const offCtx = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * 16_000),
    16_000,
  );
  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offCtx.destination);
  src.start(0);
  return offCtx.startRendering();
}

async function _blobToWAV(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const ctx      = new AudioContext();
  let decoded;
  try { decoded = await ctx.decodeAudioData(arrayBuf); }
  finally { ctx.close(); }
  const resampled = await _resampleTo16k(decoded);
  return _encodeWAV(resampled);
}

async function _sendToSTT(wavBuffer) {
  const res  = await fetch(STT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body:    wavBuffer,
  });
  const json = await res.json();
  return json.success ? (json.transcript || '') : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS helpers
// ─────────────────────────────────────────────────────────────────────────────
let _voices      = [];
let _voicesReady = false;

function _ensureVoices() {
  if (_voicesReady || !_synth) return;
  _voices = _synth.getVoices();
  if (_voices.length === 0) {
    _synth.addEventListener('voiceschanged', () => {
      _voices = _synth.getVoices();
      _voicesReady = true;
    }, { once: true });
  } else {
    _voicesReady = true;
  }
}

function _pickVoice() {
  _ensureVoices();
  return (
    _voices.find((v) => v.lang.startsWith('en') && /neural|natural|enhanced/i.test(v.name)) ||
    _voices.find((v) => v.lang.startsWith('en') && !v.localService) ||
    _voices.find((v) => v.lang.startsWith('en')) ||
    null
  );
}

export function speakText(text, opts = {}) {
  if (!_synth || !text?.trim()) return;
  _synth.cancel();
  const utt    = new SpeechSynthesisUtterance(text);
  utt.rate     = opts.rate   ?? 1.05;
  utt.pitch    = opts.pitch  ?? 1.00;
  utt.volume   = opts.volume ?? 0.92;
  const voice  = _pickVoice();
  if (voice) utt.voice = voice;
  _synth.speak(utt);
}

export function stopSpeaking() { _synth?.cancel(); }

// ─────────────────────────────────────────────────────────────────────────────
// Module-level recording state
// ─────────────────────────────────────────────────────────────────────────────
let _micStream      = null;
let _mediaRecorder  = null;
let _recordChunks   = [];
let _vadTimer       = null;
let _maxTimer       = null;
let _isRecording    = false;
let _onTranscript   = null;

// ── Public recording API ──────────────────────────────────────────────────────

export async function startListening(onResult) {
  if (_isRecording) return;
  _onTranscript = onResult;
  _recordChunks = [];

  // Open mic stream if not already open
  try {
    if (!_micStream || _micStream.getTracks().some((t) => t.readyState === 'ended')) {
      _micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  } catch (err) {
    console.warn('[useVoiceIO] getUserMedia failed:', err);
    return;
  }

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  _mediaRecorder = new MediaRecorder(_micStream, { mimeType: mime });
  _mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) _recordChunks.push(e.data); };
  _mediaRecorder.onstop = _onStop;

  _mediaRecorder.start(100);
  _isRecording = true;

  // Hard safety cap
  _maxTimer = setTimeout(stopListening, MAX_RECORD_MS);

  console.info('[useVoiceIO] 🎤 Recording started');
}

export function stopListening() {
  if (!_isRecording) return;
  _isRecording = false;
  clearTimeout(_vadTimer);
  clearTimeout(_maxTimer);
  _vadTimer = null;
  _maxTimer = null;
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    _mediaRecorder.stop();
  }
}

async function _onStop() {
  if (_recordChunks.length === 0) { _onTranscript = null; return; }
  try {
    const blob     = new Blob(_recordChunks, { type: 'audio/webm' });
    const wavBuf   = await _blobToWAV(blob);
    const text     = await _sendToSTT(wavBuf);
    console.info('[useVoiceIO] 📝 Transcript:', JSON.stringify(text));
    if (text && _onTranscript) _onTranscript(text);
  } catch (err) {
    console.error('[useVoiceIO] transcription error:', err);
  }
  _recordChunks = [];
  _onTranscript = null;
}

// Called every animation frame by useAudioReactivity
export function updateVAD(micAmplitude) {
  if (!_isRecording) return;
  if (micAmplitude > VAD_THRESHOLD) {
    // Active speech — reset silence timer
    clearTimeout(_vadTimer);
    _vadTimer = null;
  } else if (!_vadTimer) {
    // Silence started — begin countdown
    _vadTimer = setTimeout(stopListening, VAD_SILENCE_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wake word
// ─────────────────────────────────────────────────────────────────────────────

function _matchWake(text) {
  const lower = text.toLowerCase().trim();
  return WAKE_PHRASES.some((p) => lower.includes(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export default function useVoiceIO() {
  const sttEnabled      = useSettingsStore((s) => s.sttEnabled);
  const ttsEnabled      = useSettingsStore((s) => s.ttsEnabled);
  const wakeWordEnabled = useSettingsStore((s) => s.wakeWordEnabled);
  const setListening    = useAriaStore((s) => s.setListening);
  const isMounted       = useRef(true);
  const wakeRef         = useRef(null);

  // ── Wake word ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wakeWordEnabled || !_SpeechRec) return;
    let active  = true;
    let backoff = 600;

    const onWake = () => {
      if (!active || !isMounted.current) return;
      setListening(true);
      setTimeout(() => { if (isMounted.current) setListening(false); }, 700);
      document.getElementById('aria-command-input')?.focus();
    };

    function startWake() {
      if (!active) return;
      const rec         = new _SpeechRec();
      rec.lang          = 'en-US';
      rec.continuous    = true;
      rec.interimResults = true;
      wakeRef.current   = rec;

      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (_matchWake(e.results[i][0].transcript)) onWake();
        }
      };
      rec.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[wake] error:', e.error, '— retry in', backoff, 'ms');
        }
      };
      rec.onend = () => {
        if (active) {
          setTimeout(startWake, backoff);
          backoff = Math.min(backoff * 1.4, 8_000);
        }
      };
      try { rec.start(); } catch (_) {}
    }

    startWake();
    return () => {
      active = false;
      try { wakeRef.current?.abort(); } catch (_) {}
    };
  }, [wakeWordEnabled, setListening]);

  // ── TTS ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ttsEnabled || !_synth) return;
    _ensureVoices();

    const unsub = useAriaStore.subscribe(
      (state) => state.lastResponse,
      (response) => {
        if (response && isMounted.current && ttsEnabled) speakText(response);
      }
    );
    return () => { unsub(); _synth.cancel(); };
  }, [ttsEnabled]);

  useEffect(() => { if (!ttsEnabled) _synth?.cancel(); }, [ttsEnabled]);

  // ── STT cleanup when disabled ───────────────────────────────────────────
  useEffect(() => { if (!sttEnabled) stopListening(); }, [sttEnabled]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopListening();
      _synth?.cancel();
    };
  }, []);

  return { startListening, stopListening };
}
