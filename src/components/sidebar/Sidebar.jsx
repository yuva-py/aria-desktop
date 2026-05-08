// src/components/sidebar/Sidebar.jsx
// Slide-in panel from the left edge.
//
// Motion language:
//   The panel uses "materialization" — it condenses from blurred
//   over-saturation into sharp presence (x shift is only 16px, not
//   the full 320px; the dominant effect is blur→clear).
//   Tab underline uses Framer Motion layoutId for spring-animated
//   sliding between tabs rather than an instant CSS swap.
//
// Layer model:
//   SidebarHandle — always visible, fixed left edge strip  (z=25)
//   Sidebar       — AnimatePresence controlled             (z=20)
//
// Tabs:  Pipeline | Logs | Memory | Settings
//        Pipeline and Logs implemented; Memory/Settings are placeholders.
//
// Click-outside uses document.mousedown + ref.contains() — more reliable
// than a sibling overlay div in transparent Electron windows.

import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSettingsStore from '../../store/settingsStore';
import { materializeSidebar } from '../../animations/materialize';
import PipelineTab  from './tabs/PipelineTab';
import LogsTab      from './tabs/LogsTab';
import MemoryTab    from './tabs/MemoryTab';
import SettingsTab  from './tabs/SettingsTab';
import './Sidebar.css';

// Build the materialize variants with the correct off-screen direction
// (left-anchored sidebar shifts left when hidden; right-anchored shifts right).
function variantsForSide(side) {
  const sign = side === 'right' ? 1 : -1;
  const v    = materializeSidebar;
  return {
    hidden:  { ...v.hidden,  x: sign * Math.abs(v.hidden.x  ?? 22) },
    visible: v.visible,
    exit:    { ...v.exit,    x: sign * Math.abs(v.exit.x    ?? 14) },
  };
}

// ── Tab config ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'logs',     label: 'Logs'     },
  { id: 'memory',   label: 'Memory'   },
  { id: 'settings', label: 'Settings' },
];

// ── Placeholder for unimplemented tabs ──────────────────────────────────────
function TabPlaceholder({ label }) {
  return (
    <div className="sidebar-placeholder">
      <span className="sidebar-placeholder__label text-projected">
        {label} — coming soon
      </span>
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar() {
  const sidebarOpen      = useSettingsStore((s) => s.sidebarOpen);
  const sidebarTab        = useSettingsStore((s) => s.sidebarTab);
  const sidebarPosition   = useSettingsStore((s) => s.sidebarPosition);
  const toggleSidebar     = useSettingsStore((s) => s.toggleSidebar);
  const setSidebarTab     = useSettingsStore((s) => s.setSidebarTab);

  // Ref on the panel for click-outside detection
  const panelRef = useRef(null);

  // Direction-aware materialize variants (left vs right anchored)
  const sidebarVariants = useMemo(
    () => variantsForSide(sidebarPosition),
    [sidebarPosition],
  );

  // ── Click-outside ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (panelRef.current && panelRef.current.contains(e.target)) return;
    const handle = document.getElementById('aria-sidebar-handle');
    if (handle && handle.contains(e.target)) return;
    toggleSidebar();
  }, [toggleSidebar]);

  useEffect(() => {
    if (!sidebarOpen) return;
    // Small delay so the opener mousedown doesn't immediately re-close.
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown);
    }, 50);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [sidebarOpen, handleMouseDown]);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e) => { if (e.key === 'Escape') toggleSidebar(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sidebarOpen, toggleSidebar]);

  return (
    <AnimatePresence>
      {sidebarOpen && (
        <motion.aside
          id="aria-sidebar"
          ref={panelRef}
          className="sidebar"
          role="complementary"
          aria-label="ARIA panel"
          variants={sidebarVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            left:  sidebarPosition === 'left'  ? 0 : 'auto',
            right: sidebarPosition === 'right' ? 0 : 'auto',
          }}
        >
          {/* ── Tab bar ── */}
          <nav className="sidebar__tabs" role="tablist" aria-label="Sidebar tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`aria-tab-${tab.id}`}
                role="tab"
                aria-selected={sidebarTab === tab.id}
                className={`sidebar__tab${sidebarTab === tab.id ? ' sidebar__tab--active' : ''}`}
                onClick={() => setSidebarTab(tab.id)}
              >
                {tab.label}

                {/* Sliding spring-animated underline via layoutId */}
                {sidebarTab === tab.id && (
                  <motion.span
                    className="sidebar__tab-indicator"
                    layoutId="sidebar-tab-indicator"
                    transition={{
                      type:      'spring',
                      stiffness: 420,
                      damping:   32,
                    }}
                  />
                )}
              </button>
            ))}
          </nav>

          {/* ── Tab content ── */}
          <div
            className="sidebar__content"
            role="tabpanel"
            aria-labelledby={`aria-tab-${sidebarTab}`}
          >
            <AnimatePresence mode="wait">
              {sidebarTab === 'pipeline' && (
                <motion.div
                  key="pipeline"
                  initial={{ opacity: 0, y: 8  }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: '100%' }}
                >
                  <PipelineTab />
                </motion.div>
              )}

              {sidebarTab === 'logs' && (
                <motion.div
                  key="logs"
                  initial={{ opacity: 0, y: 8  }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: '100%' }}
                >
                  <LogsTab />
                </motion.div>
              )}

              {sidebarTab === 'memory' && (
                <motion.div
                  key="memory"
                  initial={{ opacity: 0, y: 8  }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: '100%' }}
                >
                  <MemoryTab />
                </motion.div>
              )}

              {sidebarTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 8  }}
                  animate={{ opacity: 1, y: 0  }}
                  exit={{    opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ height: '100%' }}
                >
                  <SettingsTab />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
