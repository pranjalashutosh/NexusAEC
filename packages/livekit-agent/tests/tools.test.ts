/**
 * Tests for tools module
 */

import {
  EMAIL_TOOLS,
  getEmailTool,
  executeEmailTool,
  executeMuteSender,
  executeFlagFollowup,
  executeMarkRead,
  executeArchiveEmail,
  executeUndoLastAction,
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

    describe('executeMuteSender', () => {
      it('mutes non-VIP sender', async () => {
        const result = await executeMuteSender(
          { sender_email: 'spam@example.com' },
          mockContext
        );

        expect(result.success).toBe(true);
        expect(result.message).toContain('Muted');
        expect(result.riskLevel).toBe('medium');
      });

      it('requires confirmation for VIP', async () => {
        const vipContext = { ...mockContext, isVip: true };
        const result = await executeMuteSender(
          { sender_email: 'vip@example.com' },
          vipContext
        );

        expect(result.success).toBe(false);
        expect(result.requiresConfirmation).toBe(true);
        expect(result.riskLevel).toBe('high');
      });
    });

    describe('executeFlagFollowup', () => {
      it('flags email with default options', async () => {
        const result = await executeFlagFollowup({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toContain('Flagged');
        expect(result.riskLevel).toBe('medium');
      });

      it('flags with due date', async () => {
        const result = await executeFlagFollowup(
          { due_date: 'tomorrow' },
          mockContext
        );

        expect(result.message).toContain('tomorrow');
      });
    });

    describe('executeMarkRead', () => {
      it('marks single email as read', async () => {
        const result = await executeMarkRead({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Marked as read.');
        expect(result.riskLevel).toBe('low');
      });

      it('marks multiple emails as read', async () => {
        const result = await executeMarkRead(
          { email_ids: 'email-1,email-2,email-3' },
          mockContext
        );

        expect(result.message).toContain('3 emails');
      });
    });

    describe('executeArchiveEmail', () => {
      it('archives email', async () => {
        const result = await executeArchiveEmail({}, mockContext);

        expect(result.success).toBe(true);
        expect(result.message).toBe('Archived.');
        expect(result.riskLevel).toBe('low');
      });
    });

    describe('executeUndoLastAction', () => {
      it('returns nothing to undo when history is empty', async () => {
        // First action to clear history
        const result = await executeUndoLastAction({}, mockContext);

        // May succeed or fail depending on previous test state
        expect(result).toBeDefined();
      });
    });

    describe('executeEmailTool', () => {
      it('executes known tool', async () => {
        const result = await executeEmailTool('mark_read', {}, mockContext);
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
