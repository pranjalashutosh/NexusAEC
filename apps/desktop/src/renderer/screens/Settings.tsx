/**
 * Settings Screen
 */

import React, { useState } from 'react';

interface Preferences {
  vips: string[];
  keywords: string[];
  topics: string[];
  mutedSenders: string[];
  verbosity: 'concise' | 'standard' | 'detailed';
  language: string;
  theme: string;
}

const DEFAULT_PREFERENCES: Preferences = {
  vips: ['ceo@company.com', 'partner@client.com'],
  keywords: ['urgent', 'ASAP', 'deadline', 'approval'],
  topics: ['Project Updates', 'Client Communications', 'Approvals'],
  mutedSenders: ['newsletter@spam.com'],
  verbosity: 'standard',
  language: 'en-US',
  theme: 'system',
};

export function SettingsScreen(): React.ReactElement {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [newVip, setNewVip] = useState('');
  const [newKeyword, setNewKeyword] = useState('');

  const handleSync = async () => {
    setSyncStatus('syncing');
    // In production, call electronAPI.preferences.sync()
    setTimeout(() => setSyncStatus('synced'), 1500);
  };

  const addVip = () => {
    if (newVip && !preferences.vips.includes(newVip)) {
      setPreferences((prev) => ({ ...prev, vips: [...prev.vips, newVip] }));
      setNewVip('');
    }
  };

  const removeVip = (vip: string) => {
    setPreferences((prev) => ({
      ...prev,
      vips: prev.vips.filter((v) => v !== vip),
    }));
  };

  const addKeyword = () => {
    if (newKeyword && !preferences.keywords.includes(newKeyword)) {
      setPreferences((prev) => ({ ...prev, keywords: [...prev.keywords, newKeyword] }));
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setPreferences((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((k) => k !== keyword),
    }));
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Manage your preferences</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
          >
            {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* VIP Contacts */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>VIP Contacts</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
          Emails from these contacts will always be prioritized
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="email"
            className="search-input"
            placeholder="Add VIP email..."
            value={newVip}
            onChange={(e) => setNewVip(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addVip()}
          />
          <button className="btn btn-primary" onClick={addVip}>
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {preferences.vips.map((vip) => (
            <span
              key={vip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '16px',
                fontSize: '14px',
              }}
            >
              {vip}
              <button
                onClick={() => removeVip(vip)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary)',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>Keywords</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
          Get alerted when these words appear in emails
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Add keyword..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
          />
          <button className="btn btn-primary" onClick={addKeyword}>
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {preferences.keywords.map((keyword) => (
            <span
              key={keyword}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                background: 'var(--color-secondary)',
                color: 'white',
                borderRadius: '16px',
                fontSize: '14px',
              }}
            >
              {keyword}
              <button
                onClick={() => removeKeyword(keyword)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Verbosity */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>Briefing Verbosity</h3>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
          Control how detailed your briefings are
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['concise', 'standard', 'detailed'] as const).map((level) => (
            <button
              key={level}
              className={`btn ${preferences.verbosity === level ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPreferences((prev) => ({ ...prev, verbosity: level }))}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Theme */}
      <div className="card">
        <h3 style={{ marginBottom: '12px' }}>Appearance</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['system', 'light', 'dark'].map((theme) => (
            <button
              key={theme}
              className={`btn ${preferences.theme === theme ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPreferences((prev) => ({ ...prev, theme }))}
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
