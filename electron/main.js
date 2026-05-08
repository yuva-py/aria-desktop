// Electron main process for ARIA desktop assistant
// Requirements:
// - Transparent, frameless, always-on-top window
// - Size: full workArea of primary display
// - Position: (0, 0) — covers entire screen
// - Global hotkey Alt+Space toggles visibility
// - Loads http://localhost:5173 in development
// - Spawns python/stub_server.py as child process on launch
// - Kills python process on app quit
// - No taskbar entry, no dock icon bounce

'use strict';

const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net  = require('net');

// ── Python stub server process ────────────────────────────────────────────────
let pythonProcess = null;

/**
 * Returns a Promise that resolves to true if something is already
 * listening on localhost:port, false otherwise.
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket
      .once('connect', () => { socket.destroy(); resolve(true);  })
      .once('error',   () => { socket.destroy(); resolve(false); })
      .once('timeout', () => { socket.destroy(); resolve(false); })
      .connect(port, '127.0.0.1');
  });
}

async function startPythonServer() {
  const alreadyRunning = await isPortInUse(7331);
  if (alreadyRunning) {
    console.log('[ARIA] Port 7331 already in use — skipping Python spawn.');
    return;
  }

  const scriptPath = path.join(__dirname, '..', 'python', 'stub_server.py');

  pythonProcess = spawn('python', [scriptPath], {
    // Detach from Electron's console so logs don't flood the terminal
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python] ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Python] process exited with code ${code}`);
    pythonProcess = null;
  });
}

// ── Window creation ───────────────────────────────────────────────────────────
let win = null;

function createWindow() {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    width:       screenWidth,
    height:      screenHeight,
    x:           0,
    y:           0,

    // ── Visual ──────────────────────────────────────────────────────────────────
    transparent:     true,
    frame:           false,
    backgroundColor: '#00000000', // fully transparent ARGB
    hasShadow:       false,        // no OS window shadow on the transparent frame

    // ── Behaviour ────────────────────────────────────────────────────────────────
    alwaysOnTop:  true,
    skipTaskbar:  true,
    resizable:    false,
    show:         false, // reveal only after content is ready

    // ── Web preferences ─────────────────────────────────────────────────────────────
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  // Hide from macOS dock (no-op on Windows/Linux, harmless to include)
  if (app.dock) {
    app.dock.hide();
  }

  // Load the Vite dev server in development
  const DEV_URL = 'http://localhost:5173';
  win.loadURL(DEV_URL);

  // Show window once the page is ready to avoid a white flash
  win.once('ready-to-show', () => {
    win.show();
  });

  // Clean up reference when window is closed
  win.on('closed', () => {
    win = null;
  });
}

// ── Fade helpers ──────────────────────────────────────────────────────────────
const FADE_STEPS = 20;
const FADE_MS    = 180; // total fade duration in ms

let _fadeTimer = null;

function _clearFade() {
  if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
}

function fadeIn(targetWin) {
  _clearFade();
  targetWin.setOpacity(0);
  targetWin.show();
  targetWin.focus();
  let step = 0;
  _fadeTimer = setInterval(() => {
    step++;
    targetWin.setOpacity(Math.min(step / FADE_STEPS, 1));
    if (step >= FADE_STEPS) { clearInterval(_fadeTimer); _fadeTimer = null; }
  }, Math.floor(FADE_MS / FADE_STEPS));
}

function fadeOut(targetWin) {
  _clearFade();
  let step = FADE_STEPS;
  _fadeTimer = setInterval(() => {
    step--;
    targetWin.setOpacity(Math.max(step / FADE_STEPS, 0));
    if (step <= 0) { clearInterval(_fadeTimer); _fadeTimer = null; targetWin.hide(); }
  }, Math.floor(FADE_MS / FADE_STEPS));
}

// ── Global hotkey: Alt+Space toggles visibility ───────────────────────────────
function registerHotkey() {
  const registered = globalShortcut.register('Alt+Space', () => {
    if (!win) return;

    if (win.isVisible()) {
      fadeOut(win);
    } else {
      fadeIn(win);
    }
  });

  if (!registered) {
    console.error('[ARIA] Failed to register global shortcut Alt+Space');
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.on('ready', () => {
  startPythonServer();
  createWindow();
  registerHotkey();
});

// Prevent Electron from quitting when all windows are closed (overlay app).
// On Windows/Linux the default behaviour IS to quit — overriding the handler
// without calling app.quit() keeps the process alive for the global hotkey.
app.on('window-all-closed', () => {
  // Intentionally empty — do NOT call app.quit() so Alt+Space can re-open.
});

app.on('will-quit', () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();

  // Kill the Python child process gracefully
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
});
