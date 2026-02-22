/**
 * DraftCard Component
 * Draft preview card showing recipient, subject, red-flag indicator, source badge, and date
 */

import React from 'react';

interface Draft {
  id: string;
  source: 'google' | 'microsoft';
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  bodyPreview: string;
  fullBody?: string;
  redFlagScore?: number;
  redFlagReasons?: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'sent' | 'deleted';
}

interface DraftCardProps {
  draft: Draft;
  onClick: () => void;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  return `${diffDays}d ago`;
}

function getRedFlagLabel(score: number): { label: string; className: string } {
  if (score >= 0.8) {
    return { label: 'High Priority', className: 'priority-high' };
  }
  if (score >= 0.5) {
    return { label: 'Medium', className: 'priority-medium' };
  }
  return { label: 'Low', className: 'priority-low' };
}

export function DraftCard({ draft, onClick }: DraftCardProps): React.ReactElement {
  const displayName = draft.recipientName || draft.recipientEmail;
  const redFlag = draft.redFlagScore ? getRedFlagLabel(draft.redFlagScore) : null;

  return (
    <div className="draft-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="draft-card-header">
        <div className="draft-card-recipient">
          <span className="recipient-avatar">{displayName.charAt(0).toUpperCase()}</span>
          <div className="recipient-info">
            <span className="recipient-name">{displayName}</span>
            {draft.recipientName && <span className="recipient-email">{draft.recipientEmail}</span>}
          </div>
        </div>
        <div className="draft-card-meta">
          <span className={`source-badge source-${draft.source}`}>
            {draft.source === 'google' ? 'Gmail' : 'Outlook'}
          </span>
          <span className="draft-time">{formatTimeAgo(draft.createdAt)}</span>
        </div>
      </div>

      <div className="draft-card-content">
        <h4 className="draft-subject">{draft.subject}</h4>
        <p className="draft-preview">{draft.bodyPreview}</p>
      </div>

      {redFlag && (
        <div className="draft-card-footer">
          <span className={`priority-badge ${redFlag.className}`}>{redFlag.label}</span>
          {draft.redFlagReasons && draft.redFlagReasons.length > 0 && (
            <span className="red-flag-reasons">{draft.redFlagReasons.slice(0, 2).join(' • ')}</span>
          )}
        </div>
      )}
    </div>
  );
}
