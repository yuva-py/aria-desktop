// src/store/settingsStore.js
// UI preferences store — theme, model, strategy, sidebar, orb size, etc.
// No middleware (no devtools, no persist).

import { create } from 'zustand';

/**
 * @typedef {'crystal'|'obsidian'} Theme
 * @typedef {'pipeline'|'logs'|'memory'|'settings'} SidebarTab
 * @typedef {'conservative'|'balanced'|'aggressive'} Strategy
 * @typedef {'small'|'medium'|'large'} OrbSize
 * @typedef {'left'|'right'} SidebarPosition
 */

const useSettingsStore = create((set) => ({
  // ── State ──────────────────────────────────────────────────────────────────

  /** @type {Theme} */
  theme: 'crystal',

  /** @type {string} */
  model: 'llama3',

  /** @type {Strategy} */
  strategy: 'balanced',

  /** @type {number} 1–20 */
  maxSteps: 10,

  /** @type {boolean} */
  sidebarOpen: false,

  /** @type {SidebarTab} */
  sidebarTab: 'pipeline',

  /** @type {SidebarPosition} */
  sidebarPosition: 'left',

  /** @type {OrbSize} */
  orbSize: 'medium',

  /** @type {boolean} — Web Audio API generated sound effects */
  soundEnabled: false,

  /** @type {boolean} — microphone input for voice reactivity */
  voiceEnabled: false,

  // ── Actions ────────────────────────────────────────────────────────────────

  /** @param {Theme} theme */
  setTheme: (theme) => set({ theme }),

  /** @param {string} model */
  setModel: (model) => set({ model }),

  /** @param {Strategy} strategy */
  setStrategy: (strategy) => set({ strategy }),

  /** @param {number} maxSteps */
  setMaxSteps: (maxSteps) => set({ maxSteps }),

  /** Toggle sidebar open/closed. */
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  /** @param {SidebarTab} tab */
  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  /** @param {SidebarPosition} pos */
  setSidebarPosition: (pos) => set({ sidebarPosition: pos }),

  /** @param {OrbSize} size */
  setOrbSize: (size) => set({ orbSize: size }),

  /** @param {boolean} v */
  setSoundEnabled: (v) => set({ soundEnabled: !!v }),

  /** @param {boolean} v */
  setVoiceEnabled: (v) => set({ voiceEnabled: !!v }),
}));

export default useSettingsStore;
