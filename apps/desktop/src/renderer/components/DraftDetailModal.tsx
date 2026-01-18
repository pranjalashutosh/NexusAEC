/**
 * DraftDetailModal Component
 * Full draft detail view with content, thread context, red-flag rationale,
 * edit capability, and Approve & Send button
 */

import React, { useState } from 'react';

interface Draft {
  id: string;
  source: 'google' | 'microsoft';
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  bodyPreview: string;
  fullBody?: string;
  threadContext?: string;
  redFlagScore?: number;
  redFlagReasons?: string[];
  createdAt: string;
  status: 'pending' | 'approved' | 'sent' | 'deleted';
}

interface DraftDetailModalProps {
  draft: Draft;
  onClose: () => void;
  onApprove: () => void | Promise<void>;
  onDelete: () => void;
  onEdit?: (updatedBody: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function DraftDetailModal({
  draft,
  onClose,
  onApprove,
  onDelete,
  onEdit,
}: DraftDetailModalProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(draft.fullBody || draft.bodyPreview);
  const [isApproving, setIsApproving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await Promise.resolve(onApprove());
    } finally {
      setIsApproving(false);
    }
  };

  const handleSaveEdit = () => {
    if (onEdit) {
      onEdit(editedBody);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    onDelete();
    setShowDeleteConfirm(false);
  };

  const displayName = draft.recipientName ?? draft.recipientEmail;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-section">
            <h2 className="modal-title">{draft.subject}</h2>
            <div className="modal-subtitle">
              <span>To: {displayName}</span>
              {draft.recipientName && (
                <span className="email-secondary">({draft.recipientEmail})</span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Meta info */}
        <div className="draft-meta-bar">
          <span className={`source-badge source-${draft.source}`}>
            {draft.source === 'google' ? 'Gmail' : 'Outlook'}
          </span>
          <span className="draft-date">{formatDate(draft.createdAt)}</span>
          {draft.redFlagScore && draft.redFlagScore >= 0.7 && (
            <span className="priority-badge priority-high">High Priority</span>
          )}
        </div>

        {/* Red flag rationale */}
        {draft.redFlagReasons && draft.redFlagReasons.length > 0 && (
          <div className="red-flag-rationale">
            <h4 className="rationale-title">Why This Draft Needs Review</h4>
            <ul className="rationale-list">
              {draft.redFlagReasons.map((reason, index) => (
                <li key={index} className="rationale-item">
                  <span className="rationale-icon">⚠️</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Thread context */}
        {draft.threadContext && (
          <div className="thread-context">
            <h4 className="context-title">Original Thread</h4>
            <div className="context-content">{draft.threadContext}</div>
          </div>
        )}

        {/* Draft content */}
        <div className="draft-content-section">
          <div className="content-header">
            <h4 className="content-title">Draft Content</h4>
            {!isEditing && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditing(true)}
              >
                ✏️ Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="edit-section">
              <textarea
                className="draft-editor"
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={10}
                autoFocus
              />
              <div className="edit-actions">
                <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveEdit}>
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="draft-body-display">
              {(draft.fullBody || draft.bodyPreview).split('\n').map((line, i) => (
                <p key={i}>{line || <br />}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="modal-footer">
          {showDeleteConfirm ? (
            <div className="delete-confirm">
              <span>Delete this draft?</span>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
            </div>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteConfirm(true)}
              >
                🗑️ Delete
              </button>
              <div className="footer-right">
                <button className="btn btn-secondary" onClick={onClose}>
                  Close
                </button>
                <button
                  className="btn btn-primary btn-approve"
                  onClick={handleApprove}
                  disabled={isApproving}
                >
                  {isApproving ? 'Sending...' : '✓ Approve & Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
