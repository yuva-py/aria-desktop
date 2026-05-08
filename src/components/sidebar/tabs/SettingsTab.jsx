// src/components/sidebar/tabs/SettingsTab.jsx
//
// Three-group settings panel for the ARIA sidebar:
//   Group 1 — INTELLIGENCE: model dropdown, strategy pills, max-steps slider
//   Group 2 — VOICE: three coming-soon toggles (STT, TTS, wake word)
//   Group 3 — APPEARANCE: theme pills, orb size pills, panel side pills
//
// Footer: version string
//
// Animation: materialize on mount; dropdown materializes on open.

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSettingsStore from '../../../store/settingsStore';
import { materialize, materializeFast } from '../../../animations/materialize';
import './SettingsTab.css';

// ──────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────
const LLM_MODELS   = ['llama3', 'mistral', 'llama3.2', 'codellama'];
const STRATEGIES   = ['conservative', 'balanced', 'aggressive'];
const THEMES       = ['crystal', 'obsidian'];
const ORB_SIZES    = ['small', 'medium', 'large'];
const PANEL_SIDES  = ['left', 'right'];

const STRATEGY_LABELS = {
  conservative: 'Conservative',
  balanced:     'Balanced',
  aggressive:   'Aggressive',
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/** Capitalise first letter for display */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ──────────────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────────────

/** Section group wrapper */
function Group({ label, children }) {
  return (
    <section className="set-group" aria-label={label}>
      <h2 className="set-group__label">{label}</h2>
      <div className="set-group__body">{children}</div>
    </section>
  );
}

/** A single labelled control row */
function Row({ label, id, children }) {
  return (
    <div className="set-row">
      <span className="set-row__label" id={id}>{label}</span>
      <div className="set-row__control" aria-labelledby={id}>{children}</div>
    </div>
  );
}

// ── Pill group (strategy / theme / orb size / panel side) ─────────────────
function PillGroup({ options, value, onChange, labelFn }) {
  return (
    <div className="set-pills" role="group">
      {options.map((opt) => (
        <button
          key={opt}
          className={`set-pill${value === opt ? ' set-pill--active' : ''}`}
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
        >
          {labelFn ? labelFn(opt) : cap(opt)}
        </button>
      ))}
    </div>
  );
}

// ── Custom LLM dropdown ───────────────────────────────────────────────────
function ModelDropdown({ value, onChange }) {
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = useCallback((model) => {
    onChange(model);
    setOpen(false);
  }, [onChange]);

  return (
    <div className="set-dropdown" ref={containerRef}>
      {/* Trigger */}
      <button
        className="set-dropdown__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        id="model-dropdown-trigger"
      >
        <span className="set-dropdown__value">{value}</span>
        <span className="set-dropdown__arrow" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>

      {/* Options panel */}
      <AnimatePresence>
        {open && (
          <motion.ul
            className="set-dropdown__menu"
            role="listbox"
            aria-label="Select model"
            variants={materializeFast}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {LLM_MODELS.map((m) => (
              <li
                key={m}
                className={`set-dropdown__option${m === value ? ' set-dropdown__option--active' : ''}`}
                role="option"
                aria-selected={m === value}
                onClick={() => select(m)}
                onKeyDown={(e) => { if (e.key === 'Enter') select(m); }}
                tabIndex={0}
              >
                {m}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Max-steps slider ──────────────────────────────────────────────────────
function StepsSlider({ value, onChange }) {
  // Percentage for filled-track CSS var
  const pct = ((value - 1) / 19) * 100;

  return (
    <div className="set-slider__wrapper">
      <input
        id="set-max-steps"
        type="range"
        min={1}
        max={20}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="set-slider"
        style={{ '--set-slider-pct': `${pct}%` }}
        aria-label="Max steps per goal"
        aria-valuemin={1}
        aria-valuemax={20}
        aria-valuenow={value}
      />
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange, disabled }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`set-toggle${checked ? ' set-toggle--on' : ''}${disabled ? ' set-toggle--disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      aria-label="Toggle"
    >
      <motion.span
        className="set-toggle__thumb"
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

// ── Voice row (coming-soon, disabled) ─────────────────────────────────────
function VoiceRow({ label, id }) {
  const [on, setOn] = useState(false);
  return (
    <div className="set-row set-row--voice">
      <div className="set-row__label-group">
        <span className="set-row__label" id={id}>{label}</span>
        <span className="set-voice__badge">coming soon</span>
      </div>
      <Toggle
        id={`${id}-toggle`}
        checked={on}
        onChange={setOn}
        disabled
      />
    </div>
  );
}

// ── Active sound-effects row ─────────────────────────────────────────────
function SoundRow({ checked, onChange }) {
  return (
    <div className="set-row set-row--voice">
      <div className="set-row__label-group">
        <span className="set-row__label" id="set-sound-label">Sound effects</span>
      </div>
      <Toggle
        id="set-sound-toggle"
        checked={checked}
        onChange={onChange}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Root — SettingsTab
// ──────────────────────────────────────────────────────────────────────────
export default function SettingsTab() {
  const model           = useSettingsStore((s) => s.model);
  const strategy        = useSettingsStore((s) => s.strategy);
  const maxSteps        = useSettingsStore((s) => s.maxSteps);
  const theme           = useSettingsStore((s) => s.theme);
  const orbSize         = useSettingsStore((s) => s.orbSize);
  const sidebarPosition = useSettingsStore((s) => s.sidebarPosition);
  const soundEnabled    = useSettingsStore((s) => s.soundEnabled);

  const setModel           = useSettingsStore((s) => s.setModel);
  const setStrategy        = useSettingsStore((s) => s.setStrategy);
  const setMaxSteps        = useSettingsStore((s) => s.setMaxSteps);
  const setTheme           = useSettingsStore((s) => s.setTheme);
  const setOrbSize         = useSettingsStore((s) => s.setOrbSize);
  const setSidebarPosition = useSettingsStore((s) => s.setSidebarPosition);
  const setSoundEnabled    = useSettingsStore((s) => s.setSoundEnabled);

  // Sync body class when theme changes
  useEffect(() => {
    document.body.classList.remove('crystal', 'obsidian');
    document.body.classList.add(theme);
  }, [theme]);

  return (
    <motion.div
      className="set-tab"
      variants={materialize}
      initial="hidden"
      animate="visible"
      exit="exit"
    >

      {/* ══ GROUP 1 — INTELLIGENCE ═══════════════════════════════ */}
      <Group label="INTELLIGENCE">

        {/* Model selector */}
        <Row label="Model" id="set-model-label">
          <ModelDropdown value={model} onChange={setModel} />
        </Row>

        {/* Strategy pills */}
        <Row label="Strategy" id="set-strategy-label">
          <PillGroup
            options={STRATEGIES}
            value={strategy}
            onChange={setStrategy}
            labelFn={(s) => STRATEGY_LABELS[s]}
          />
        </Row>

        {/* Max steps slider */}
        <div className="set-row set-row--slider">
          <div className="set-row__label-group">
            <span className="set-row__label" id="set-steps-label">
              Max steps per goal
            </span>
            <span className="set-slider__value">{maxSteps}</span>
          </div>
          <StepsSlider value={maxSteps} onChange={setMaxSteps} />
        </div>

      </Group>

      {/* ══ GROUP 2 — VOICE & SOUND ══════════════════════════════ */}
      <Group label="VOICE">
        <SoundRow checked={soundEnabled} onChange={setSoundEnabled} />
        <VoiceRow label="Speech-to-text" id="set-stt"  />
        <VoiceRow label="Text-to-speech" id="set-tts"  />
        <VoiceRow label="Wake word"      id="set-wake" />
      </Group>

      {/* ══ GROUP 3 — APPEARANCE ═════════════════════════════════ */}
      <Group label="APPEARANCE">

        {/* Theme */}
        <Row label="Theme" id="set-theme-label">
          <PillGroup
            options={THEMES}
            value={theme}
            onChange={setTheme}
          />
        </Row>

        {/* Orb size */}
        <Row label="Orb size" id="set-orb-label">
          <PillGroup
            options={ORB_SIZES}
            value={orbSize}
            onChange={setOrbSize}
          />
        </Row>

        {/* Sidebar position */}
        <Row label="Panel side" id="set-side-label">
          <PillGroup
            options={PANEL_SIDES}
            value={sidebarPosition}
            onChange={setSidebarPosition}
          />
        </Row>

      </Group>

      {/* ══ FOOTER ═══════════════════════════════════════════════ */}
      <footer className="set-footer">
        ARIA v0.1.0 · Phase 4
      </footer>

    </motion.div>
  );
}
