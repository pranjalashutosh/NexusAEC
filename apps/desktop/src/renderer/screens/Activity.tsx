/**
 * Activity Screen - Audit Trail
 */

import React, { useState } from 'react';
import { ActivityRow } from '../components/ActivityRow';

interface AuditEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  action: string;
  target: string;
  outcome: 'success' | 'failure' | 'pending';
  undoable: boolean;
  undoneAt?: string;
}

// Mock data
const MOCK_ENTRIES: AuditEntry[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    sessionId: 'session-1',
    action: 'email_flagged',
    target: 'john@client.com: Q4 Budget Review',
    outcome: 'success',
    undoable: true,
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    sessionId: 'session-1',
    action: 'draft_approved',
    target: 'sarah@vendor.com: Contract Amendment',
    outcome: 'success',
    undoable: false,
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    sessionId: 'session-1',
    action: 'sender_muted',
    target: 'newsletter@spam.com',
    outcome: 'success',
    undoable: true,
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    sessionId: 'session-2',
    action: 'vip_added',
    target: 'ceo@company.com',
    outcome: 'success',
    undoable: true,
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    sessionId: 'session-2',
    action: 'email_archived',
    target: 'marketing@vendor.com: Weekly Newsletter',
    outcome: 'success',
    undoable: true,
  },
];

export function ActivityScreen(): React.ReactElement {
  const [entries, setEntries] = useState<AuditEntry[]>(MOCK_ENTRIES);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7days');

  const handleUndo = async (entryId: string) => {
    // In production, call electronAPI.audit.undo(entryId)
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, undoneAt: new Date().toISOString() } : e
      )
    );
  };

  const handleExport = async (format: 'csv' | 'json') => {
    // In production, call electronAPI.audit.export(format)
    alert(`Exporting as ${format.toUpperCase()}...`);
  };

  const filteredEntries = entries.filter((entry) => {
    if (entry.undoneAt) return false;
    if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
    return true;
  });

  const actionTypes = [...new Set(entries.map((e) => e.action))];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Activity Log</h1>
        <p className="page-subtitle">View and manage your action history</p>
      </div>

      <div className="filters">
        <select
          className="filter-select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="all">All Actions</option>
          {actionTypes.map((action) => (
            <option key={action} value={action}>
              {action.replace('_', ' ')}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => handleExport('csv')}>
            Export CSV
          </button>
          <button className="btn btn-secondary" onClick={() => handleExport('json')}>
            Export JSON
          </button>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h2 className="empty-state-title">No Activity</h2>
          <p className="empty-state-text">No actions recorded for this period</p>
        </div>
      ) : (
        <div className="card">
          {filteredEntries.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              onUndo={entry.undoable ? () => handleUndo(entry.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
