// src/store/ariaStore.js
// Core ARIA runtime store — tracks the full lifecycle of a session.
// No middleware (no devtools, no persist).

import { create } from 'zustand';

/**
 * @typedef {'idle'|'planning'|'executing'|'recovering'|'error'|'complete'|'tier3'} Phase
 *
 * @typedef {{ text: string, index: number, status: 'pending'|'active'|'success'|'failed' }} Goal
 *
 * @typedef {{ timestamp: string, tool: string, action: string, success: boolean, summary: string }} LogEntry
 *
 * @typedef {{ action: string, path: string, reason: string }} Tier3Action
 */

const useAriaStore = create((set) => ({
  // ── State ──────────────────────────────────────────────────────────────────
  /** @type {Phase} */
  phase: 'idle',

  /** @type {string} */
  currentGoal: '',

  /** @type {Goal[]} */
  goals: [],

  /** @type {string} */
  currentTool: '',

  /** @type {LogEntry[]} */
  logs: [],

  /** @type {boolean} */
  isVisible: false,

  /** True while the mic is open and user speech is detected. */
  isListening: false,

  /** True while a synthesised ARIA sound is playing. */
  isSpeaking: false,

  /**
   * Populated when phase === 'tier3'.
   * @type {Tier3Action|null}
   */
  tier3Action: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  /** @param {Phase} phase */
  setPhase: (phase) => set({ phase }),

  /** @param {string} goal */
  setCurrentGoal: (goal) => set({ currentGoal: goal }),

  /** @param {Goal[]} goals */
  setGoals: (goals) => set({ goals }),

  /**
   * Update the status of a single goal identified by its index.
   * @param {number} index
   * @param {'pending'|'active'|'success'|'failed'} status
   */
  updateGoalStatus: (index, status) =>
    set((state) => ({
      goals: state.goals.map((g) =>
        g.index === index ? { ...g, status } : g
      ),
    })),

  /** @param {string} tool */
  setCurrentTool: (tool) => set({ currentTool: tool }),

  /**
   * Append a new log entry.  timestamp defaults to now if omitted.
   * @param {Omit<LogEntry, 'timestamp'> & { timestamp?: string }} entry
   */
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          timestamp: new Date().toISOString(),
          ...entry,
        },
      ],
    })),

  /** @param {boolean} visible */
  setVisible: (visible) => set({ isVisible: visible }),

  /** @param {boolean} v */
  setListening: (v) => set({ isListening: !!v }),

  /** @param {boolean} v */
  setSpeaking: (v) => set({ isSpeaking: !!v }),

  // ── Tier-3 (destructive action) ────────────────────────────────────────────

  /**
   * Surface a destructive action for explicit user confirmation.
   * Sets phase to 'tier3' and stores the action descriptor.
   * @param {Tier3Action} action
   */
  setTier3Action: (action) => set({ tier3Action: action, phase: 'tier3' }),

  /**
   * User confirmed — clear tier3 state, return to idle, then notify backend.
   * Backend will emit goal_completed + session_complete over the WS channel.
   */
  confirmTier3: () => {
    set({ tier3Action: null, phase: 'idle' });
    fetch('http://localhost:7331/tier3/confirm', { method: 'POST' })
      .catch((err) => console.error('[ariaStore] tier3/confirm failed:', err));
  },

  /**
   * User cancelled — discard the pending tier3 action, return to idle, notify backend.
   */
  cancelTier3: () => {
    set({ tier3Action: null, phase: 'idle' });
    fetch('http://localhost:7331/tier3/cancel', { method: 'POST' })
      .catch((err) => console.error('[ariaStore] tier3/cancel failed:', err));
  },
}));

export default useAriaStore;
