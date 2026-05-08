// src/hooks/useMemorySync.js
// On mount, fetches GET /memory from the ARIA server and hydrates the memory
// store so the UI reflects the backend's persisted patterns and metrics.
//
// Usage: call useMemorySync() once at the App root (alongside useARIAStream).

import { useEffect } from 'react';
import useMemoryStore from '../store/memoryStore';

const MEMORY_URL = 'http://localhost:7331/memory';

/**
 * Fetches /memory on mount and syncs patterns + metrics into memoryStore.
 * Episodes are kept from the persisted store unless the server returns them.
 */
export default function useMemorySync() {
  const setPatterns = useMemoryStore((s) => s.setPatterns);
  const setMetrics  = useMemoryStore((s) => s.setMetrics);

  useEffect(() => {
    fetch(MEMORY_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`GET /memory returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.patterns)) {
          setPatterns(data.patterns);
        }
        if (data.metrics && typeof data.metrics === 'object') {
          setMetrics(data.metrics);
        }
      })
      .catch((err) => {
        // Server may not be running yet — fail silently so the UI still loads.
        console.warn('[useMemorySync] Could not fetch /memory:', err.message);
      });
  // Run once on mount — setPatterns/setMetrics are stable Zustand actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
