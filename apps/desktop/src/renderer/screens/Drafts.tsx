/**
 * Drafts Screen
 */

import React, { useState } from 'react';

import { DraftCard } from '../components/DraftCard';
import { DraftDetailModal } from '../components/DraftDetailModal';

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

// Mock data for development
const MOCK_DRAFTS: Draft[] = [
  {
    id: '1',
    source: 'google',
    recipientEmail: 'john@client.com',
    recipientName: 'John Smith',
    subject: 'Re: Q4 Budget Review',
    bodyPreview: 'Thank you for your detailed breakdown. I have reviewed the numbers and...',
    fullBody: 'Thank you for your detailed breakdown. I have reviewed the numbers and have a few questions about the marketing allocation. Could we schedule a call to discuss?\n\nBest regards',
    redFlagScore: 0.8,
    redFlagReasons: ['Budget discussion', 'Client communication'],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'pending',
  },
  {
    id: '2',
    source: 'microsoft',
    recipientEmail: 'sarah@vendor.com',
    recipientName: 'Sarah Johnson',
    subject: 'Contract Amendment Request',
    bodyPreview: 'Following our discussion yesterday, I wanted to formally request...',
    fullBody: 'Following our discussion yesterday, I wanted to formally request an amendment to Section 4.2 of our agreement. The proposed changes would allow for greater flexibility in delivery timelines.',
    redFlagScore: 0.9,
    redFlagReasons: ['Contract modification', 'Legal implications'],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    status: 'pending',
  },
  {
    id: '3',
    source: 'google',
    recipientEmail: 'team@company.com',
    recipientName: 'Team',
    subject: 'Weekly Status Update',
    bodyPreview: 'Hi everyone, here is this weeks status update for Project Alpha...',
    fullBody: 'Hi everyone,\n\nHere is this weeks status update for Project Alpha:\n\n- Milestone 3: Complete\n- Milestone 4: In progress (80%)\n- Blockers: None\n\nPlease let me know if you have questions.',
    redFlagScore: 0.2,
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    status: 'pending',
  },
];

export function DraftsScreen(): React.ReactElement {
  const [drafts, setDrafts] = useState<Draft[]>(MOCK_DRAFTS);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const filteredDrafts = drafts.filter((draft) => {
    if (draft.status !== 'pending') {
      return false;
    }
    if (filter === 'google' && draft.source !== 'google') {
      return false;
    }
    if (filter === 'microsoft' && draft.source !== 'microsoft') {
      return false;
    }
    if (filter === 'urgent' && (draft.redFlagScore ?? 0) < 0.7) {
      return false;
    }
    if (search) {
      const searchLower = search.toLowerCase();
      return (
        draft.subject.toLowerCase().includes(searchLower) ||
        draft.recipientEmail.toLowerCase().includes(searchLower) ||
        draft.recipientName?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const handleApprove = async (draftId: string) => {
    // In production, call electronAPI.drafts.approve(draftId)
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'sent' as const } : d))
    );
    setSelectedDraft(null);
  };

  const handleDelete = async (draftId: string) => {
    // In production, call electronAPI.drafts.delete(draftId)
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'deleted' as const } : d))
    );
    setSelectedDraft(null);
  };

  const pendingCount = drafts.filter((d) => d.status === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Drafts Pending Review</h1>
        <p className="page-subtitle">
          {pendingCount} draft{pendingCount !== 1 ? 's' : ''} awaiting your approval
        </p>
      </div>

      <div className="filters">
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Sources</option>
          <option value="google">Gmail</option>
          <option value="microsoft">Outlook</option>
          <option value="urgent">Urgent Only</option>
        </select>

        <input
          type="text"
          className="search-input"
          placeholder="Search drafts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredDrafts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <h2 className="empty-state-title">All Caught Up</h2>
          <p className="empty-state-text">No pending drafts to review</p>
        </div>
      ) : (
        <div className="list-container">
          {filteredDrafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onClick={() => setSelectedDraft(draft)}
            />
          ))}
        </div>
      )}

      {selectedDraft && (
        <DraftDetailModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onApprove={() => handleApprove(selectedDraft.id)}
          onDelete={() => handleDelete(selectedDraft.id)}
        />
      )}
    </div>
  );
}
