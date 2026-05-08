// src/components/sidebar/SidebarHandle.jsx
// Fixed left-edge trigger strip — the only persistent entry point to the sidebar.
//
// Visual behaviour:
//   rest  → 4px wide, spectral gradient, vertically centered
//   hover → 8px wide, tooltip "Open Panel" appears
//   click → toggles settingsStore.sidebarOpen

import React from 'react';
import useSettingsStore from '../../store/settingsStore';
import './SidebarHandle.css';

export default function SidebarHandle() {
  const toggle      = useSettingsStore((s) => s.toggleSidebar);
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen);

  return (
    <button
      id="aria-sidebar-handle"
      className={`sidebar-handle${sidebarOpen ? ' sidebar-handle--open' : ''}`}
      onClick={toggle}
      aria-label="Toggle ARIA panel"
      aria-expanded={sidebarOpen}
    >
      <span className="sidebar-handle__tooltip">
        {sidebarOpen ? 'Close Panel' : 'Open Panel'}
      </span>
    </button>
  );
}
