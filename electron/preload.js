// Electron preload.js — secure IPC bridge for ARIA desktop
// Runs in an isolated context (contextIsolation: true, nodeIntegration: false).
// Exposes a minimal, channel-whitelisted API to the renderer via contextBridge.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Channel whitelist ─────────────────────────────────────────────────────────
// Only these channels may pass through the bridge in either direction.
const ALLOWED_CHANNELS = ['aria-input', 'aria-response', 'theme-change'];

function isAllowed(channel) {
  return ALLOWED_CHANNELS.includes(channel);
}

// ── Bridge API ────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('ariaAPI', {
  /**
   * Send a message to the main process.
   * @param {string} channel - Must be one of the allowed channels.
   * @param {*}      data    - Serialisable payload.
   */
  send(channel, data) {
    if (!isAllowed(channel)) {
      console.warn(`[preload] Blocked send on unauthorised channel: "${channel}"`);
      return;
    }
    ipcRenderer.send(channel, data);
  },

  /**
   * Register a one-way listener for messages from the main process.
   * @param {string}   channel  - Must be one of the allowed channels.
   * @param {Function} callback - Called with (event, ...args).
   * @returns {Function} Unsubscribe function – call it to remove this specific listener.
   */
  on(channel, callback) {
    if (!isAllowed(channel)) {
      console.warn(`[preload] Blocked listener on unauthorised channel: "${channel}"`);
      return () => {};
    }

    // Wrap callback so callers never receive the raw IpcRendererEvent object,
    // which would expose internal Electron internals to the renderer.
    const handler = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, handler);

    // Return an unsubscribe helper for fine-grained cleanup.
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Remove all listeners attached to a channel.
   * Useful for component unmount / hot-reload cleanup.
   * @param {string} channel - Must be one of the allowed channels.
   */
  removeAllListeners(channel) {
    if (!isAllowed(channel)) {
      console.warn(`[preload] Blocked removeAllListeners on unauthorised channel: "${channel}"`);
      return;
    }
    ipcRenderer.removeAllListeners(channel);
  },
});
