// src/components/voice/VoiceStatus.jsx
// Floating voice-state indicator — shows mic/TTS/wake status + live activity.
// Appears at top-center only when at least one voice feature is active.

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useAriaStore     from '../../store/ariaStore';
import useSettingsStore from '../../store/settingsStore';
import './VoiceStatus.css';

// ── Icons ─────────────────────────────────────────────────────────────────────
function MicIcon() {
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true">
      <rect x="2.5" y="0.5" width="5" height="7" rx="2.5"
        fill="currentColor" />
      <path d="M0.5 6.5a4.5 4.5 0 0 0 9 0"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5" y1="11" x2="5" y2="13"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="3" y1="13" x2="7" y2="13"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M1 4H3.5L7 1.5V10.5L3.5 8H1V4Z"
        fill="currentColor" />
      <path d="M9 3.5C9.83 4.33 10.33 5.5 10.33 6S9.83 7.67 9 8.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WakeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="2" fill="currentColor" />
      <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

// ── Pill badge ────────────────────────────────────────────────────────────────
function Pill({ icon, label, active, color }) {
  return (
    <span
      className={`vs-pill${active ? ' vs-pill--on' : ''}`}
      style={active ? { '--pill-color': color } : {}}
      title={`${label}: ${active ? 'ON' : 'OFF'}`}
    >
      <span className="vs-pill__icon">{icon}</span>
      <span className="vs-pill__label">{label}</span>
      <span className="vs-pill__dot" />
    </span>
  );
}

// ── Waveform bars (shown when listening) ─────────────────────────────────────
function WaveBars() {
  return (
    <span className="vs-wave" aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default memo(function VoiceStatus() {
  const sttEnabled      = useSettingsStore((s) => s.sttEnabled);
  const ttsEnabled      = useSettingsStore((s) => s.ttsEnabled);
  const wakeWordEnabled = useSettingsStore((s) => s.wakeWordEnabled);
  const isListening     = useAriaStore((s) => s.isListening);
  const isSpeaking      = useAriaStore((s) => s.isSpeaking);
  const lastResponse    = useAriaStore((s) => s.lastResponse);

  const anyEnabled = sttEnabled || ttsEnabled || wakeWordEnabled;

  return (
    <AnimatePresence>
      {anyEnabled && (
        <motion.div
          className="voice-status"
          initial={{ opacity: 0, y: -12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0,   scale: 1    }}
          exit={{    opacity: 0, y: -8,  scale: 0.96 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ── Status pills ── */}
          <div className="vs-pills">
            <Pill icon={<MicIcon />}     label="STT"  active={sttEnabled}      color="#4af" />
            <Pill icon={<SpeakerIcon />} label="TTS"  active={ttsEnabled}      color="#0df" />
            <Pill icon={<WakeIcon />}    label="Wake" active={wakeWordEnabled}  color="#a78bfa" />
          </div>

          {/* ── Divider ── */}
          <span className="vs-divider" />

          {/* ── Live activity ── */}
          <AnimatePresence mode="wait">
            {isListening ? (
              <motion.div
                key="listening"
                className="vs-activity vs-activity--listening"
                initial={{ opacity: 0, x: 6  }}
                animate={{ opacity: 1, x: 0  }}
                exit={{    opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
              >
                <WaveBars />
                <span className="vs-activity__label">Listening…</span>
              </motion.div>
            ) : isSpeaking ? (
              <motion.div
                key="speaking"
                className="vs-activity vs-activity--speaking"
                initial={{ opacity: 0, x: 6  }}
                animate={{ opacity: 1, x: 0  }}
                exit={{    opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
              >
                <SpeakerIcon />
                <span className="vs-activity__label vs-activity__label--truncate">
                  {lastResponse ? lastResponse.slice(0, 55) + (lastResponse.length > 55 ? '…' : '') : 'Speaking…'}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                className="vs-activity vs-activity--idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{    opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <span className="vs-activity__label">Ready</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
