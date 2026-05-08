// src/store/memoryStore.js
// ARIA memory store — behavioural patterns, aggregate metrics, episode history.
// Uses zustand/middleware persist so state survives page reload (localStorage).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * @typedef {{ intent: string, count: number, confidence: number }} Pattern
 *
 * @typedef {{ totalGoals: number, successRate: number, avgSteps: number }} Metrics
 *
 * @typedef {{ timestamp: string, goal: string, success: boolean, steps: number }} Episode
 */

const useMemoryStore = create(
  persist(
    (set) => ({
      // ── State ──────────────────────────────────────────────────────────────

      /** @type {Pattern[]} */
      patterns: [],

      /** @type {Metrics} */
      metrics: {
        totalGoals:  0,
        successRate: 0,
        avgSteps:    0,
      },

      /** @type {Episode[]} */
      episodes: [],

      // ── Actions ────────────────────────────────────────────────────────────

      /** @param {Pattern[]} patterns */
      setPatterns: (patterns) => set({ patterns }),

      /**
       * Merge partial metric updates into the existing metrics object.
       * @param {Partial<Metrics>} updates
       */
      setMetrics: (updates) =>
        set((state) => ({
          metrics: { ...state.metrics, ...updates },
        })),

      /**
       * Append a new episode.  timestamp defaults to now if omitted.
       * @param {Omit<Episode, 'timestamp'> & { timestamp?: string }} episode
       */
      addEpisode: (episode) =>
        set((state) => ({
          episodes: [
            ...state.episodes,
            {
              timestamp: new Date().toISOString(),
              ...episode,
            },
          ],
        })),

      /**
       * Remove a learned pattern by its intent string.
       * Also calls POST /memory/forget so the Python server stays in sync.
       * @param {string} intent
       */
      removePattern: (intent) => {
        set((state) => ({
          patterns: state.patterns.filter((p) => p.intent !== intent),
        }));
        fetch('http://localhost:7331/memory/forget', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ intent }),
        }).catch((err) => console.error('[memoryStore] memory/forget failed:', err));
      },
    }),
    {
      name: 'aria-memory', // localStorage key
    }
  )
);

export default useMemoryStore;
