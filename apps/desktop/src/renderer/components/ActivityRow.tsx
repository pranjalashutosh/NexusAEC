/**
 * ActivityRow Component
 * Single audit entry display with action icon, details, and undo button
 */

import React from 'react';

import { UndoButton } from './UndoButton';

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

interface ActivityRowProps {
  entry: AuditEntry;
  onUndo?: () => void;
}

const ACTION_ICONS: Record<string, string> = {
  email_flagged: '🚩',
  draft_approved: '✅',
  draft_deleted: '🗑️',
  sender_muted: '🔇',
  vip_added: '⭐',
  vip_removed: '✖️',
  email_archived: '📥',
  email_moved: '📁',
  email_read: '👁️',
  keyword_added: '🏷️',
  keyword_removed: '🏷️',
  topic_added: '📌',
  default: '📋',
};

const ACTION_LABELS: Record<string, string> = {
  email_flagged: 'Flagged email',
  draft_approved: 'Approved & sent draft',
  draft_deleted: 'Deleted draft',
  sender_muted: 'Muted sender',
  vip_added: 'Added VIP',
  vip_removed: 'Removed VIP',
  email_archived: 'Archived email',
  email_moved: 'Moved email',
  email_read: 'Marked as read',
  keyword_added: 'Added keyword',
  keyword_removed: 'Removed keyword',
  topic_added: 'Added topic',
};

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getOutcomeStyle(outcome: string): { color: string; label: string } {
  switch (outcome) {
    case 'success':
      return { color: 'var(--color-success)', label: 'Success' };
    case 'failure':
      return { color: 'var(--color-danger)', label: 'Failed' };
    case 'pending':
      return { color: 'var(--color-warning)', label: 'Pending' };
    default:
      return { color: 'var(--color-text-secondary)', label: outcome };
  }
}

export function ActivityRow({ entry, onUndo }: ActivityRowProps): React.ReactElement {
  const icon = ACTION_ICONS[entry.action] || ACTION_ICONS.default;
  const label = ACTION_LABELS[entry.action] || entry.action.replace('_', ' ');
  const outcomeStyle = getOutcomeStyle(entry.outcome);

  const isUndone = !!entry.undoneAt;

  return (
    <div className={`activity-row ${isUndone ? 'activity-undone' : ''}`}>
      <div className="activity-icon">{icon}</div>

      <div className="activity-content">
        <div className="activity-main">
          <span className="activity-action">{label}</span>
          <span className="activity-target">{entry.target}</span>
        </div>
        <div className="activity-meta">
          <span className="activity-time">{formatTimestamp(entry.timestamp)}</span>
          <span className="activity-outcome" style={{ color: outcomeStyle.color }}>
            {outcomeStyle.label}
          </span>
          {isUndone && <span className="activity-undone-label">Undone</span>}
        </div>
      </div>

      <div className="activity-actions">
        {onUndo && !isUndone && entry.undoable && <UndoButton onUndo={onUndo} entryId={entry.id} />}
      </div>
    </div>
  );
}
