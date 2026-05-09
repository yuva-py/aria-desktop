// src/App.jsx
// ARIA application root.
//
// Layer model:
//   z=0  ARIAOrb    — fixed full-viewport WebGL canvas (behind everything)
//   z=10 UI shell   — topbar, live strip, command bar float on top

import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import useARIAStream        from './hooks/useARIAStream';
import useAudioReactivity  from './hooks/useAudioReactivity';
import useMemorySync       from './hooks/useMemorySync';
import useVoiceIO          from './hooks/useVoiceIO';
import { _registerVoiceIO } from './components/input/CommandBar';
import useAriaStore       from './store/ariaStore';
import useSettingsStore   from './store/settingsStore';

import ARIAOrb       from './components/orb/ARIAOrb';
import LiveStrip     from './components/shared/LiveStrip';
import CommandBar    from './components/input/CommandBar';
import ThemeToggle   from './components/shared/ThemeToggle';
import Sidebar             from './components/sidebar/Sidebar';
import SidebarHandle       from './components/sidebar/SidebarHandle';
import Tier3Panel          from './components/Tier3Panel';
import CursorLens          from './components/shared/CursorLens';
import FloatingStatusChip  from './components/shared/FloatingStatusChip';

import './styles/globals.css';
import './App.css';

export default function App() {
  const theme         = useSettingsStore((s) => s.theme);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const phase         = useAriaStore((s) => s.phase);

  useARIAStream();
  useAudioReactivity();
  useMemorySync();

  // Voice I/O — registers STT/TTS/wake word; exposes API to CommandBar
  const voiceIO = useVoiceIO();
  useEffect(() => { _registerVoiceIO(voiceIO); }, [voiceIO]);

  // ── Apply theme class to <body> ──────────────────────────────────────────
  useEffect(() => {
    document.body.classList.remove('crystal', 'obsidian');
    document.body.classList.add(theme);
  }, [theme]);

  // ── Ctrl+\ toggles the sidebar panel ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

  return (
    <div className="aria-app" id="aria-app-root">

      {/* ── z=0: full-viewport WebGL canvas ──────────────────────────────────── */}
      <ARIAOrb />

      {/* ── z=1: Screen edge vignette (obsidian only) ─────────────────────── */}
      {theme === 'obsidian' && (
        <div className="aria-vignette" aria-hidden="true" />
      )}

      {/* ── z=1: Orb ambient floor glow ──────────────────────────────── */}
      <div className="aria-floor-glow" aria-hidden="true" />

      {/* ── z=1: Orb ground halo (narrow ellipse just below the orb) ─ */}
      <div className="orb-ground-halo" aria-hidden="true" />

      {/* ── z=15: Floating status chip (above orb, below topbar) ─────── */}
      <FloatingStatusChip />

      {/* ── z=10: DOM UI layer ───────────────────────────────────────────── */}
      <div className="aria-ui-layer">

        <header className="aria-app__topbar">
          <ThemeToggle />
        </header>

        {/* Live strip sits vertically centered — orb is behind it in WebGL */}
        <main className="aria-app__main">
          <LiveStrip />
        </main>

        <footer className="aria-app__footer">
          <CommandBar />
        </footer>

      </div>

      {/* ── z=20: Sidebar (slide-in panel) ───────────────────────────────── */}
      <Sidebar />

      {/* ── z=25: Sidebar handle (always-visible edge strip) ─────────────── */}
      <SidebarHandle />

      {/* ── z=59: Tier-3 backdrop blur (renders behind panel) ─────────────── */}
      <AnimatePresence>
        {phase === 'tier3' && (
          <motion.div
            key="tier3-backdrop"
            className="t3-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            transition={{ duration: 0.30, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* ── z=60: Tier-3 destructive-action bottom sheet ──────────────────── */}
      <AnimatePresence>
        {phase === 'tier3' && <Tier3Panel key="tier3-panel" />}
      </AnimatePresence>

      {/* ── z=9999: Cursor refraction lens flare (only near orb rim) ──────── */}
      <CursorLens />

    </div>
  );
}
