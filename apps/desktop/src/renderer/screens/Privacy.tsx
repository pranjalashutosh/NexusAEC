/**
 * Privacy Screen
 */

import React, { useState } from 'react';

interface DataUsage {
  category: string;
  size: string;
  retention: string;
}

const DATA_USAGE: DataUsage[] = [
  { category: 'Draft Cache', size: '8.2 MB', retention: 'Until approved/deleted' },
  { category: 'Audit Trail', size: '1.4 MB', retention: '30 days' },
  { category: 'Preferences', size: '12 KB', retention: 'Until deleted' },
  { category: 'Session Cache', size: '256 KB', retention: '24 hours' },
];

export function PrivacyScreen(): React.ReactElement {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearData = async () => {
    if (!confirm('This will delete all local data. This action cannot be undone.')) {
      return;
    }

    setIsClearing(true);
    // In production, call electronAPI to clear data
    setTimeout(() => {
      setIsClearing(false);
      alert('All data cleared successfully');
    }, 1500);
  };

  const handleExportData = async () => {
    // In production, call electronAPI to export all data
    alert('Exporting your data...');
  };

  const handleRevokeAccess = async () => {
    if (!confirm('This will disconnect all email accounts. You will need to reconnect them.')) {
      return;
    }
    alert('Access revoked. Please reconnect your accounts.');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Privacy & Data</h1>
        <p className="page-subtitle">Manage your data and privacy settings</p>
      </div>

      {/* Data Usage */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '16px' }}>Data Storage</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 0',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500,
                }}
              >
                Category
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500,
                }}
              >
                Size
              </th>
              <th
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 500,
                }}
              >
                Retention
              </th>
            </tr>
          </thead>
          <tbody>
            {DATA_USAGE.map((item) => (
              <tr key={item.category} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 0' }}>{item.category}</td>
                <td
                  style={{
                    textAlign: 'right',
                    padding: '12px 0',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {item.size}
                </td>
                <td style={{ textAlign: 'right', padding: '12px 0', color: 'var(--color-muted)' }}>
                  {item.retention}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Privacy Info */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '12px' }}>How We Handle Your Data</h3>
        <ul
          style={{ paddingLeft: '20px', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}
        >
          <li>Emails are processed in real-time and not stored long-term</li>
          <li>Voice transcripts are processed by Deepgram and not stored</li>
          <li>Draft references are stored locally until you approve or delete them</li>
          <li>Audit logs are encrypted and auto-deleted after 30 days</li>
          <li>We never sell or share your personal data</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="card">
        <h3 style={{ marginBottom: '16px' }}>Data Actions</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={handleExportData}>
            📥 Export My Data
          </button>
          <button className="btn btn-secondary" onClick={handleRevokeAccess}>
            🔗 Revoke Email Access
          </button>
          <button className="btn btn-danger" onClick={handleClearData} disabled={isClearing}>
            {isClearing ? '🗑️ Clearing...' : '🗑️ Clear All Data'}
          </button>
        </div>
      </div>
    </div>
  );
}
