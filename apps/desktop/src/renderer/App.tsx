/**
 * Main App Component
 */

import React from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { ActivityScreen } from './screens/Activity';
import { DraftsScreen } from './screens/Drafts';
import { PrivacyScreen } from './screens/Privacy';
import { SettingsScreen } from './screens/Settings';

export function App(): React.ReactElement {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DraftsScreen />} />
          <Route path="/drafts" element={<DraftsScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/privacy" element={<PrivacyScreen />} />
        </Routes>
      </main>
    </div>
  );
}

function Sidebar(): React.ReactElement {
  const location = useLocation();

  const navItems = [
    { path: '/drafts', label: 'Drafts', icon: '📝', badge: 3 },
    { path: '/activity', label: 'Activity', icon: '📋' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
    { path: '/privacy', label: 'Privacy', icon: '🔒' },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">N</div>
        <span className="sidebar-title">NexusAEC</span>
      </div>

      <ul className="nav-list">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive || (item.path === '/drafts' && location.pathname === '/') ? 'active' : ''}`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <span className="badge">{item.badge}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
