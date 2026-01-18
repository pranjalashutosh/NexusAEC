/**
 * Tests for prompts module
 */

import {
  buildSystemPrompt,
  getDefaultSystemPrompt,
  DEFAULT_SYSTEM_PROMPT_CONTEXT,
  type SystemPromptContext,
  generateTopicTransition,
  generateProgressUpdate,
  generateEmailSummaryPrompt,
  generateRedFlagPrompt,
  generateConfirmation,
  generateDisambiguationPrompt,
  generateBriefingOpening,
  generateBriefingClosing,
  type BriefingTopic,
  type BriefingContext,
  type EmailSummaryInput,
} from '../src/prompts';

describe('livekit-agent/prompts', () => {
  describe('system-prompt', () => {
    it('builds system prompt with default context', () => {
      const prompt = getDefaultSystemPrompt();

      expect(prompt).toContain('Nexus');
      expect(prompt).toContain('executive assistant');
      expect(prompt).toContain('SAFETY');
    });

    it('builds system prompt with custom context', () => {
      const context: SystemPromptContext = {
        userName: 'John',
        timeOfDay: 'afternoon',
        vipNames: ['Alice', 'Bob'],
        mutedSenders: ['spam@example.com'],
        verbosityLevel: 'concise',
        briefingMode: 'walking',
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain('John');
      expect(prompt).toContain('afternoon');
      expect(prompt).toContain('Alice');
      expect(prompt).toContain('Bob');
      expect(prompt).toContain('walking');
      expect(prompt).toContain('concise');
    });

    it('adapts greeting based on time of day', () => {
      const morning = buildSystemPrompt({ ...DEFAULT_SYSTEM_PROMPT_CONTEXT, timeOfDay: 'morning' });
      const afternoon = buildSystemPrompt({ ...DEFAULT_SYSTEM_PROMPT_CONTEXT, timeOfDay: 'afternoon' });
      const evening = buildSystemPrompt({ ...DEFAULT_SYSTEM_PROMPT_CONTEXT, timeOfDay: 'evening' });

      expect(morning).toContain('Good morning');
      expect(afternoon).toContain('Good afternoon');
      expect(evening).toContain('Good evening');
    });

    it('includes driving safety notes', () => {
      const drivingPrompt = buildSystemPrompt({
        ...DEFAULT_SYSTEM_PROMPT_CONTEXT,
        briefingMode: 'driving',
      });

      expect(drivingPrompt).toContain('DRIVING');
      expect(drivingPrompt).toContain('safety');
    });
  });

  describe('briefing-prompts', () => {
    const mockBriefingContext: BriefingContext = {
      totalItems: 10,
      currentPosition: 3,
      currentTopic: 'VIP Emails',
      remainingTopics: ['Flagged', 'Updates'],
      estimatedMinutesRemaining: 5,
    };

    const mockTopic: BriefingTopic = {
      name: 'VIP Emails',
      itemCount: 5,
      priority: 'high',
    };

    describe('generateTopicTransition', () => {
      it('generates first topic introduction', () => {
        const result = generateTopicTransition(null, mockTopic, mockBriefingContext);

        expect(result).toContain("Let's start with VIP Emails");
        expect(result).toContain('5 items');
      });

      it('generates transition between topics', () => {
        const result = generateTopicTransition('Inbox', mockTopic, mockBriefingContext);

        expect(result).toContain('Moving on to VIP Emails');
        expect(result).toContain('high priority');
      });
    });

    describe('generateProgressUpdate', () => {
      it('generates progress for items remaining', () => {
        const result = generateProgressUpdate(mockBriefingContext);

        expect(result).toContain('remaining');
      });

      it('generates end message when complete', () => {
        const endContext = { ...mockBriefingContext, currentPosition: 10 };
        const result = generateProgressUpdate(endContext);

        expect(result).toContain('everything');
      });
    });

    describe('generateEmailSummaryPrompt', () => {
      it('generates summary prompt for regular email', () => {
        const email: EmailSummaryInput = {
          from: 'alice@example.com',
          subject: 'Project Update',
          snippet: 'Here is the latest status on...',
          timestamp: new Date(),
          isFromVip: false,
          hasAttachments: false,
        };

        const result = generateEmailSummaryPrompt(email);

        expect(result).toContain('alice@example.com');
        expect(result).toContain('Project Update');
      });

      it('marks VIP emails', () => {
        const email: EmailSummaryInput = {
          from: 'ceo@company.com',
          subject: 'Important',
          snippet: 'Please review...',
          timestamp: new Date(),
          isFromVip: true,
          hasAttachments: true,
          threadLength: 5,
        };

        const result = generateEmailSummaryPrompt(email);

        expect(result).toContain('[VIP]');
        expect(result).toContain('attachments');
        expect(result).toContain('5 messages');
      });
    });

    describe('generateRedFlagPrompt', () => {
      it('returns empty for low score', () => {
        const email: EmailSummaryInput = {
          from: 'test@example.com',
          subject: 'Test',
          snippet: 'Content',
          timestamp: new Date(),
          isFromVip: false,
          hasAttachments: false,
          redFlagScore: 0.3,
        };

        const result = generateRedFlagPrompt(email);
        expect(result).toBe('');
      });

      it('generates urgent callout for high score', () => {
        const email: EmailSummaryInput = {
          from: 'test@example.com',
          subject: 'Test',
          snippet: 'Content',
          timestamp: new Date(),
          isFromVip: false,
          hasAttachments: false,
          redFlagScore: 0.9,
          redFlagReasons: ['deadline approaching'],
        };

        const result = generateRedFlagPrompt(email);
        expect(result).toContain('URGENT');
        expect(result).toContain('deadline approaching');
      });
    });

    describe('generateConfirmation', () => {
      it('generates low risk confirmation', () => {
        const result = generateConfirmation('markRead', 'low');
        expect(result).toBe('Marked as read.');
      });

      it('generates medium risk confirmation', () => {
        const result = generateConfirmation('flag', 'medium');
        expect(result).toBe('Flagged for follow-up.');
      });
    });

    describe('generateDisambiguationPrompt', () => {
      it('generates prompt for multiple options', () => {
        const options = [
          { label: 'Email from John', description: 'About budget' },
          { label: 'Email from Sarah', description: 'About project' },
        ];

        const result = generateDisambiguationPrompt(options);

        expect(result).toContain('Email from John');
        expect(result).toContain('Email from Sarah');
      });

      it('handles empty options', () => {
        const result = generateDisambiguationPrompt([]);
        expect(result).toContain('clarify');
      });
    });

    describe('generateBriefingOpening', () => {
      it('generates opening with topics', () => {
        const result = generateBriefingOpening(mockBriefingContext, 'John');

        expect(result).toContain('John');
        expect(result).toContain('10 items');
      });
    });

    describe('generateBriefingClosing', () => {
      it('generates closing with action summary', () => {
        const result = generateBriefingClosing(3, 2);

        expect(result).toContain('3 actions');
        expect(result).toContain('2 items flagged');
      });

      it('generates simple closing when no actions', () => {
        const result = generateBriefingClosing(0, 0);

        expect(result).toContain('Nothing needed');
      });
    });
  });
});
