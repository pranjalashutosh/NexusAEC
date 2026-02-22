/**
 * Tests for tools module
 */

import {
  EMAIL_TOOLS,
  getEmailTool,
  executeEmailTool,
  executeMuteSender,
  executePrioritizeVip,
  executeFlagFollowup,
  executeMarkRead,
  executeArchiveEmail,
  executeCreateDraft,
  executeCreateFolder,
  executeMoveEmails,
  executeSearchEmails,
  executeUndoLastAction,
  setEmailServices,
  clearEmailServices,
  isVip,
  isMuted,
  type EmailActionContext,
  NAVIGATION_TOOLS,
  getNavigationTool,
  executeNavigationTool,
  executeSkipTopic,
  executeNextItem,
  executeGoBack,
  executePauseBriefing,
  executeResumeBriefing,
  executeStopBriefing,
  createBriefingState,
  updateBriefingState,
  type BriefingState,
} from '../src/tools';

// =============================================================================
// Mock UnifiedInboxService
// =============================================================================

function createMockInboxService() {
  return {
    markRead: jest.fn().mockResolvedValue({ items: [], errors: [], allSucceeded: true }),
    markUnread: jest.fn().mockResolvedValue({ items: [], errors: [], allSucceeded: true }),
    flagEmails: jest.fn().mockResolvedValue({ items: [], errors: [], allSucceeded: true }),
    unflagEmails: jest.fn().mockResolvedValue({ items: [], errors: [], allSucceeded: true }),
    archiveEmails: jest.fn().mockResolvedValue({ items: [], errors: [], allSucceeded: true }),
    moveToFolder: jest.fn().mockResolvedValue(undefined),
    fetchEmail: jest.fn().mockResolvedValue(null),
    createDraft: jest.fn().mockResolvedValue({
      id: 'draft-123',
      source: 'OUTLOOK',
      subject: 'Re: Test',
      to: [],
      cc: [],
      bcc: [],
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      isPendingReview: true,
      attachments: [],
    }),
    createFolder: jest.fn().mockResolvedValue({
      id: 'outlook:folder-new',
      source: 'OUTLOOK',
      providerId: 'folder-new',
      name: 'TestFolder',
      totalCount: 0,
      unreadCount: 0,
      isSystem: false,
    }),
    deleteFolder: jest.fn().mockResolvedValue(undefined),
    fetchFolders: jest.fn().mockResolvedValue({
      folders: [
        {
          id: 'outlook:inbox',
          name: 'Inbox',
          source: 'OUTLOOK',
          providerId: 'inbox',
          totalCount: 10,
          unreadCount: 5,
          isSystem: true,
          systemType: 'inbox',
        },
        {
          id: 'outlook:archive',
          name: 'Archive',
          source: 'OUTLOOK',
          providerId: 'archive',
          totalCount: 100,
          unreadCount: 0,
          isSystem: true,
          systemType: 'archive',
        },
        {
          id: 'outlook:projects',
          name: 'Projects',
          source: 'OUTLOOK',
          providerId: 'projects',
          totalCount: 20,
          unreadCount: 3,
          isSystem: false,
        },
      ],
      errors: [],
    }),
    fetchUnread: jest.fn().mockResolvedValue({
      items: [
        {
          id: 'outlook:msg-1',
          source: 'OUTLOOK',
          subject: 'Q4 Report',
          from: { email: 'boss@example.com', name: 'Boss' },
          to: [{ email: 'user@example.com' }],
          cc: [],
          bcc: [],
          receivedAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          bodyPreview: 'Please review...',
          isRead: false,
          isFlagged: false,
          hasAttachments: true,
          attachments: [],
          folder: 'Inbox',
          labels: [],
          importance: 'high',
        },
      ],
      totalCount: 1,
      errors: [],
    }),
    getActiveSources: jest.fn().mockReturnValue(['OUTLOOK']),
  } as any;
}

describe('livekit-agent/tools', () => {
  describe('email-tools', () => {
    const mockContext: EmailActionContext = {
      emailId: 'email-123',
      from: 'sender@example.com',
      subject: 'Test Email',
      isVip: false,
    };

    describe('EMAIL_TOOLS', () => {
      it('contains all expected tools', () => {
        const toolNames = EMAIL_TOOLS.map((t) => t.function.name);

        expect(toolNames).toContain('mute_sender');
        expect(toolNames).toContain('prioritize_vip');
        expect(toolNames).toContain('flag_followup');
        expect(toolNames).toContain('mark_read');
        expect(toolNames).toContain('archive_email');
        expect(toolNames).toContain('undo_last_action');
        expect(toolNames).toContain('create_folder');
        expect(toolNames).toContain('move_emails');
        expect(toolNames).toContain('search_emails');
      });

      it('tools have required structure', () => {
        for (const tool of EMAIL_TOOLS) {
          expect(tool.type).toBe('function');
          expect(tool.function.name).toBeDefined();
          expect(tool.function.description).toBeDefined();
          expect(tool.function.parameters).toBeDefined();
        }
      });
    });

    describe('getEmailTool', () => {
      it('returns tool by name', () => {
        const tool = getEmailTool('flag_followup');
        expect(tool?.function.name).toBe('flag_followup');
      });

      it('returns undefined for unknown tool', () => {
        const tool = getEmailTool('unknown_tool');
        expect(tool).toBeUndefined();
      });
    });

    // =========================================================================
    // Local-only executors (no service required)
    // =========================================================================

    describe('executeMuteSender', () => {
      it('mutes non-VIP sender', async () => {
        const result = await executeMuteSender({ sender_email: 'spam@example.com' }, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Muted');
        expect(result.riskLevel).toBe('medium');
      });

      it('requires confirmation for VIP', async () => {
        const vipContext = { ...mockContext, isVip: true };
        const result = await executeMuteSender({ sender_email: 'vip@example.com' }, vipContext);

        expect(result.success).toBe(false);
        expect(result.requiresConfirmation).toBe(true);
        expect(result.riskLevel).toBe('high');
      });

      it('actually adds sender to mute list', async () => {
        const email = 'mute-test@example.com';
        await executeMuteSender({ sender_email: email, duration: '1_week' }, mockContext);
        expect(isMuted(email)).toBe(true);
      });
    });

    describe('executePrioritizeVip', () => {
      it('adds sender to VIP list', async () => {
        const email = 'vip-test@example.com';
        const result = await executePrioritizeVip({ sender_email: email }, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('VIP');
        expect(isVip(email)).toBe(true);
      });

      it('is idempotent for existing VIP', async () => {
        const email = 'vip-existing@example.com';
        await executePrioritizeVip({ sender_email: email }, mockContext);
        const result = await executePrioritizeVip({ sender_email: email }, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('already');
      });
    });

    describe('isVip / isMuted', () => {
      it('isVip returns false for unknown email', () => {
        expect(isVip('unknown@example.com')).toBe(false);
      });

      it('isMuted returns false for unknown email', () => {
        expect(isMuted('unknown@example.com')).toBe(false);
      });
    });

    // =========================================================================
    // Service registry
    // =========================================================================

    describe('service registry', () => {
      afterEach(() => {
        clearEmailServices();
      });

      it('provider-backed executors return not-connected when services not set', async () => {
        const result = await executeMarkRead({}, mockContext);
        expect(result.success).toBe(false);
        expect(result.message).toContain('not connected');
      });

      it('provider-backed executors work when services are set', async () => {
        const mockInbox = createMockInboxService();
        setEmailServices(mockInbox);

        const result = await executeMarkRead({ email_ids: 'email-123' }, mockContext);
        expect(result.success).toBe(true);
        expect(mockInbox.markRead).toHaveBeenCalledWith(['email-123']);
      });

      it('clearEmailServices resets services', async () => {
        const mockInbox = createMockInboxService();
        setEmailServices(mockInbox);
        clearEmailServices();

        const result = await executeMarkRead({}, mockContext);
        expect(result.success).toBe(false);
        expect(result.message).toContain('not connected');
      });
    });

    // =========================================================================
    // Provider-backed executors (with mock service)
    // =========================================================================

    describe('provider-backed executors', () => {
      let mockInbox: ReturnType<typeof createMockInboxService>;

      beforeEach(() => {
        mockInbox = createMockInboxService();
        setEmailServices(mockInbox);
      });

      afterEach(() => {
        clearEmailServices();
      });

      describe('executeMarkRead', () => {
        it('marks single email as read', async () => {
          const result = await executeMarkRead({ email_ids: 'email-123' }, mockContext);

          expect(result.success).toBe(true);
          expect(result.message).toBe('Marked as read.');
          expect(mockInbox.markRead).toHaveBeenCalledWith(['email-123']);
        });

        it('marks multiple emails as read', async () => {
          const result = await executeMarkRead(
            { email_ids: 'email-1,email-2,email-3' },
            mockContext
          );

          expect(result.message).toContain('3 emails');
          expect(mockInbox.markRead).toHaveBeenCalledWith(['email-1', 'email-2', 'email-3']);
        });
      });

      describe('executeFlagFollowup', () => {
        it('flags email', async () => {
          const result = await executeFlagFollowup({ email_id: 'email-123' }, mockContext);

          expect(result.success).toBe(true);
          expect(result.message).toContain('Flagged');
          expect(mockInbox.flagEmails).toHaveBeenCalledWith(['email-123']);
        });

        it('flags with due date', async () => {
          const result = await executeFlagFollowup(
            { email_id: 'email-123', due_date: 'tomorrow' },
            mockContext
          );

          expect(result.message).toContain('tomorrow');
        });
      });

      describe('executeArchiveEmail', () => {
        it('archives email', async () => {
          const result = await executeArchiveEmail({ email_id: 'email-123' }, mockContext);

          expect(result.success).toBe(true);
          expect(result.message).toBe('Archived.');
          expect(mockInbox.archiveEmails).toHaveBeenCalledWith(['email-123']);
        });
      });

      describe('executeCreateDraft', () => {
        it('creates draft via inbox service', async () => {
          const result = await executeCreateDraft(
            { in_reply_to: 'email-123', body: 'Thanks for the update.' },
            mockContext
          );

          expect(result.success).toBe(true);
          expect(result.requiresConfirmation).toBe(true);
          expect(result.riskLevel).toBe('high');
          expect(result.data?.['draftId']).toBe('draft-123');
          expect(mockInbox.createDraft).toHaveBeenCalled();
        });
      });

      describe('executeCreateFolder', () => {
        it('creates folder', async () => {
          const result = await executeCreateFolder({ folder_name: 'TestFolder' }, mockContext);

          expect(result.success).toBe(true);
          expect(result.message).toContain('TestFolder');
          expect(result.data?.['folderId']).toBe('outlook:folder-new');
          expect(mockInbox.createFolder).toHaveBeenCalledWith('TestFolder', 'OUTLOOK', undefined);
        });
      });

      describe('executeMoveEmails', () => {
        it('moves emails to existing folder', async () => {
          const result = await executeMoveEmails(
            { email_ids: 'email-1,email-2', target_folder: 'Projects' },
            mockContext
          );

          expect(result.success).toBe(true);
          expect(result.message).toContain('Projects');
          expect(mockInbox.moveToFolder).toHaveBeenCalledWith(
            ['email-1', 'email-2'],
            'outlook:projects'
          );
        });

        it('returns error for non-existent folder', async () => {
          const result = await executeMoveEmails(
            { email_ids: 'email-1', target_folder: 'NonExistent' },
            mockContext
          );

          expect(result.success).toBe(false);
          expect(result.message).toContain('not found');
          expect(result.requiresConfirmation).toBe(true);
        });

        it('returns error for empty email IDs', async () => {
          const result = await executeMoveEmails(
            { email_ids: '', target_folder: 'Projects' },
            mockContext
          );

          expect(result.success).toBe(false);
          expect(result.message).toContain('No email IDs');
        });
      });

      describe('executeSearchEmails', () => {
        it('searches emails', async () => {
          const result = await executeSearchEmails({ query: 'Q4 Report' }, mockContext);

          expect(result.success).toBe(true);
          expect(result.data?.['count']).toBe(1);
          expect(mockInbox.fetchUnread).toHaveBeenCalled();
        });

        it('returns no results message', async () => {
          mockInbox.fetchUnread.mockResolvedValueOnce({ items: [], totalCount: 0, errors: [] });

          const result = await executeSearchEmails({ query: 'nonexistent' }, mockContext);

          expect(result.message).toContain('No emails found');
        });
      });
    });

    // =========================================================================
    // Undo tests (with mock service)
    // =========================================================================

    describe('undo', () => {
      let mockInbox: ReturnType<typeof createMockInboxService>;

      beforeEach(() => {
        mockInbox = createMockInboxService();
        setEmailServices(mockInbox);
      });

      afterEach(() => {
        clearEmailServices();
      });

      it('undoes mark_read by calling markUnread', async () => {
        await executeMarkRead({ email_ids: 'email-1' }, mockContext);
        const result = await executeUndoLastAction({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Undid mark as read');
        expect(mockInbox.markUnread).toHaveBeenCalledWith(['email-1']);
      });

      it('undoes flag_followup by calling unflagEmails', async () => {
        await executeFlagFollowup({ email_id: 'email-1' }, mockContext);
        const result = await executeUndoLastAction({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('follow-up flag');
        expect(mockInbox.unflagEmails).toHaveBeenCalledWith(['email-1']);
      });

      it('undoes archive_email by moving back to inbox', async () => {
        await executeArchiveEmail({ email_id: 'email-1' }, mockContext);
        const result = await executeUndoLastAction({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('inbox');
        expect(mockInbox.moveToFolder).toHaveBeenCalledWith(['email-1'], 'outlook:inbox');
      });

      it('undoes mute_sender by removing from mute list', async () => {
        const email = 'undo-mute@example.com';
        await executeMuteSender({ sender_email: email }, mockContext);
        expect(isMuted(email)).toBe(true);

        const result = await executeUndoLastAction({}, mockContext);
        expect(result.success).toBe(true);
        expect(isMuted(email)).toBe(false);
      });

      it('undoes prioritize_vip by removing from VIP list', async () => {
        const email = 'undo-vip@example.com';
        await executePrioritizeVip({ sender_email: email }, mockContext);
        expect(isVip(email)).toBe(true);

        const result = await executeUndoLastAction({}, mockContext);
        expect(result.success).toBe(true);
        expect(isVip(email)).toBe(false);
      });

      it('returns nothing to undo when history is empty', async () => {
        // Drain any leftover actions (both successful and non-reversible)
        let result = await executeUndoLastAction({}, mockContext);
        while (result.message !== "There's nothing to undo.") {
          result = await executeUndoLastAction({}, mockContext);
        }

        expect(result.success).toBe(false);
        expect(result.message).toContain('nothing to undo');
      });
    });

    // =========================================================================
    // executeEmailTool dispatch
    // =========================================================================

    describe('executeEmailTool', () => {
      it('executes known tool', async () => {
        const result = await executeEmailTool(
          'mute_sender',
          { sender_email: 'test@example.com' },
          mockContext
        );
        expect(result.success).toBe(true);
      });

      it('returns error for unknown tool', async () => {
        const result = await executeEmailTool('unknown_action', {}, mockContext);
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unknown');
      });
    });
  });

  describe('navigation-tools', () => {
    const mockState: BriefingState = {
      currentTopicIndex: 0,
      currentItemIndex: 1,
      totalTopics: 3,
      topicItems: [5, 3, 2],
      isPaused: false,
      history: [{ topicIndex: 0, itemIndex: 0 }],
    };

    describe('NAVIGATION_TOOLS', () => {
      it('contains all expected tools', () => {
        const toolNames = NAVIGATION_TOOLS.map((t) => t.function.name);

        expect(toolNames).toContain('skip_topic');
        expect(toolNames).toContain('next_item');
        expect(toolNames).toContain('go_back');
        expect(toolNames).toContain('repeat_that');
        expect(toolNames).toContain('go_deeper');
        expect(toolNames).toContain('pause_briefing');
        expect(toolNames).toContain('resume_briefing');
        expect(toolNames).toContain('stop_briefing');
      });
    });

    describe('getNavigationTool', () => {
      it('returns tool by name', () => {
        const tool = getNavigationTool('skip_topic');
        expect(tool?.function.name).toBe('skip_topic');
      });
    });

    describe('executeSkipTopic', () => {
      it('skips to next topic', () => {
        const result = executeSkipTopic({}, mockState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('skip_topic');
        expect(result.data?.['newTopicIndex']).toBe(1);
      });

      it('fails on last topic', () => {
        const lastTopicState = { ...mockState, currentTopicIndex: 2 };
        const result = executeSkipTopic({}, lastTopicState);

        expect(result.success).toBe(false);
        expect(result.action).toBe('none');
      });
    });

    describe('executeNextItem', () => {
      it('moves to next item in topic', () => {
        const result = executeNextItem({}, mockState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('next_item');
        expect(result.data?.['newItemIndex']).toBe(2);
      });

      it('moves to next topic at end of current topic', () => {
        const endOfTopicState = { ...mockState, currentItemIndex: 4 };
        const result = executeNextItem({}, endOfTopicState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('skip_topic');
      });
    });

    describe('executeGoBack', () => {
      it('goes back one item', () => {
        const result = executeGoBack({ steps: '1' }, mockState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('go_back');
      });

      it('fails when not enough history', () => {
        const result = executeGoBack({ steps: '10' }, mockState);

        expect(result.success).toBe(false);
        expect(result.action).toBe('none');
      });

      it('goes to topic start', () => {
        const result = executeGoBack({ steps: 'topic_start' }, mockState);

        expect(result.success).toBe(true);
        expect(result.data?.['newItemIndex']).toBe(0);
      });
    });

    describe('executePauseBriefing', () => {
      it('pauses briefing', () => {
        const result = executePauseBriefing({}, mockState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('pause');
      });

      it('fails if already paused', () => {
        const pausedState = { ...mockState, isPaused: true };
        const result = executePauseBriefing({}, pausedState);

        expect(result.success).toBe(false);
      });
    });

    describe('executeResumeBriefing', () => {
      it('resumes paused briefing', () => {
        const pausedState = { ...mockState, isPaused: true };
        const result = executeResumeBriefing({}, pausedState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('resume');
      });

      it('fails if not paused', () => {
        const result = executeResumeBriefing({}, mockState);

        expect(result.success).toBe(false);
      });
    });

    describe('executeStopBriefing', () => {
      it('stops briefing', () => {
        const result = executeStopBriefing({}, mockState);

        expect(result.success).toBe(true);
        expect(result.action).toBe('stop');
      });
    });

    describe('createBriefingState', () => {
      it('creates initial state', () => {
        const state = createBriefingState([5, 3, 2]);

        expect(state.currentTopicIndex).toBe(0);
        expect(state.currentItemIndex).toBe(0);
        expect(state.totalTopics).toBe(3);
        expect(state.isPaused).toBe(false);
      });
    });

    describe('updateBriefingState', () => {
      it('updates state after next_item', () => {
        const result = executeNextItem({}, mockState);
        const newState = updateBriefingState(mockState, result);

        expect(newState.currentItemIndex).toBe(2);
        expect(newState.history.length).toBe(2);
      });

      it('updates state after pause', () => {
        const result = executePauseBriefing({}, mockState);
        const newState = updateBriefingState(mockState, result);

        expect(newState.isPaused).toBe(true);
      });
    });

    describe('executeNavigationTool', () => {
      it('executes known tool', () => {
        const result = executeNavigationTool('next_item', {}, mockState);
        expect(result.success).toBe(true);
      });

      it('returns error for unknown tool', () => {
        const result = executeNavigationTool('unknown_nav', {}, mockState);
        expect(result.success).toBe(false);
      });
    });
  });
});
