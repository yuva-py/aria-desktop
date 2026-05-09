// src/hooks/useARIAStream.js
// Manages the persistent WebSocket connection to the ARIA stub server.
//
// Behaviour:
//   • Connects on mount, cleans up on unmount.
//   • Parses each incoming JSON message and dispatches to the appropriate
//     Zustand store action based on the "event" field.
//   • On unexpected close / error: retries with exponential back-off
//     (2 s → 4 s → 8 s, max 3 attempts).
//   • Returns { connected: boolean, lastEvent: object | null }

import { useEffect, useRef, useState, useCallback } from 'react';
import useAriaStore          from '../store/ariaStore';
import useSettingsStore      from '../store/settingsStore';  // available for future use
import useConversationStore  from '../store/conversationStore';
import { play as playSound } from '../sound/ariaSounds';

// ── Constants ─────────────────────────────────────────────────────────────────
const WS_URL          = 'ws://localhost:7331/stream';
const MAX_RETRIES     = 3;
const BASE_DELAY_MS   = 2_000; // doubles each attempt: 2 s, 4 s, 8 s

// ── Event dispatcher ──────────────────────────────────────────────────────────
/**
 * Routes a parsed server event to the correct Zustand store action(s).
 * Returns the parsed event object so callers can surface it as `lastEvent`.
 *
 * @param {{ event: string, data: object }} parsed
 * @param {ReturnType<typeof useAriaStore.getState>} store  — live store reference
 */
function dispatch(parsed, store) {
  const { event, data } = parsed;

  switch (event) {
    case 'goal_planned':
      // data: { goals: string[], count: number }
      // Shape each string goal into the Goal object expected by the store.
      store.setGoals(
        (data.goals ?? []).map((text, i) => ({
          text,
          index: i + 1,
          status: 'pending',
        }))
      );
      store.setPhase('planning');
      break;

    case 'goal_started':
      // data: { goal: string, index: number }
      store.setCurrentGoal(data.goal);
      store.setPhase('executing');
      break;

    case 'tool_dispatched':
      // data: { tool: string, action: string }
      store.setCurrentTool(data.tool);
      store.setCurrentGoal(`Executing · ${data.tool} → ${data.action}`);
      break;

    case 'tool_result':
      // data: { success: boolean, summary: string }
      store.addLog({ ...data, timestamp: Date.now() });
      break;

    case 'recovery_triggered':
      // data: { reason: string }
      store.setPhase('recovering');
      break;

    case 'goal_completed':
      // data: { index: number, success: boolean }
      store.updateGoalStatus(
        data.index,
        data.success ? 'success' : 'failed'
      );
      playSound(data.success ? 'complete' : 'error');
      break;

    case 'tier3_required':
      // data: { action: string, path?: string, reason?: string }
      // Store the full tier-3 descriptor so Tier3Panel can render it.
      // setTier3Action also flips phase to 'tier3' atomically.
      store.setTier3Action({
        action: data.action,
        path:   data.path   ?? '',
        reason: data.reason ?? '',
      });
      store.setCurrentGoal(
        `[TIER3] ${data.action}${data.path ? ` → ${data.path}` : ''}`
      );
      playSound('tier3');
      break;

    case 'session_complete':
      // data: { response: string }
      store.setPhase('complete');
      store.setCurrentGoal(data.response);
      store.setLastResponse(data.response ?? '');  // TTS hook subscribes to this
      // Add ARIA response to conversation history
      useConversationStore.getState().addAriaMessage(data.response ?? '');
      playSound('response');
      break;

    default:
      console.warn('[useARIAStream] Unknown event type:', event);
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
/**
 * @returns {{ connected: boolean, lastEvent: object | null }}
 */
export default function useARIAStream() {
  const [connected, setConnected]   = useState(false);
  const [lastEvent,  setLastEvent]  = useState(null);

  // Stable refs — survive re-renders without triggering the effect again.
  const wsRef        = useRef(null);   // active WebSocket instance
  const retryCount   = useRef(0);      // current attempt index (0-based)
  const retryTimer   = useRef(null);   // pending setTimeout handle
  const isMounted    = useRef(true);   // guards against post-unmount setState

  // Pull store actions once — getState() is always fresh, no subscription needed.
  const store = useAriaStore.getState();

  // ── connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(() => {
    if (!isMounted.current) return;

    console.info(`[useARIAStream] Connecting to ${WS_URL} (attempt ${retryCount.current + 1})`);

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    // ── open ────────────────────────────────────────────────────────────────
    ws.onopen = () => {
      if (!isMounted.current) { ws.close(); return; }
      console.info('[useARIAStream] Connected.');
      retryCount.current = 0;       // reset backoff on successful connect
      setConnected(true);
    };

    // ── message ─────────────────────────────────────────────────────────────
    ws.onmessage = (evt) => {
      if (!isMounted.current) return;
      let parsed;
      try {
        parsed = JSON.parse(evt.data);
      } catch (err) {
        console.error('[useARIAStream] Failed to parse message:', evt.data, err);
        return;
      }

      // Always update lastEvent so consumers can react to any message.
      setLastEvent(parsed);

      // Get fresh store state each time — avoids stale closure over actions.
      dispatch(parsed, useAriaStore.getState());
    };

    // ── close / error (shared retry logic) ──────────────────────────────────
    const handleDisconnect = (reason) => {
      if (!isMounted.current) return;
      setConnected(false);

      const attempt = retryCount.current;
      if (attempt >= MAX_RETRIES) {
        console.error(`[useARIAStream] Max retries (${MAX_RETRIES}) reached. Giving up.`);
        useAriaStore.getState().setPhase('error');
        return;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 2 s, 4 s, 8 s
      console.warn(
        `[useARIAStream] ${reason}. Retrying in ${delay / 1000}s… (${attempt + 1}/${MAX_RETRIES})`
      );

      retryCount.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };

    ws.onclose = (evt) => {
      // code 1000 = clean close (e.g. unmount triggered ws.close())
      if (evt.code !== 1000) {
        handleDisconnect(`Connection closed (code ${evt.code})`);
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose, so only log here.
      console.error('[useARIAStream] WebSocket error.');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  //   connect has no changing deps — store actions are stable, URL is constant.

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;

      // Cancel any pending retry timer.
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }

      // Close the socket cleanly (code 1000 prevents the retry path).
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { connected, lastEvent };
}
