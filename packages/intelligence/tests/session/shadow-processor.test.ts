/**
 * Tests for ShadowProcessor
 */

import RedisMock from 'ioredis-mock';
import {
  ShadowProcessor,
  type ShadowProcessorOptions,
  type TranscriptEvent,
} from '../../src/session/shadow-processor';
import { RedisSessionStore } from '../../src/session/redis-session-store';
import {
  createInitialDriveState,
  InterruptStatus,
  type DriveState,
} from '../../src/session/drive-state';

describe('ShadowProcessor', () => {
  let store: RedisSessionStore;
  let processor: ShadowProcessor;
  let testState: DriveState;

  beforeEach(async () => {
    // Create Redis mock and store
    const redisMock = new RedisMock();
    store = new RedisSessionStore({
      client: redisMock as any,
      keyPrefix: 'test:session:',
    });

    // Create initial test state
    testState = createInitialDriveState({
      sessionId: 'session-123',
      userId: 'user-456',
      roomName: 'briefing-room',
      topicIds: ['topic-1', 'topic-2', 'topic-3'],
      topicEmailMap: {
        'topic-1': ['email-1', 'email-2'],
        'topic-2': ['email-3', 'email-4'],
        'topic-3': ['email-5'],
      },
      sources: ['OUTLOOK'],
    });

    await store.create(testState);

    // Create processor
    const options: ShadowProcessorOptions = {
      store,
      confidenceThreshold: 0.7,
      processInterim: false,
    };

    processor = new ShadowProcessor(options);
  });

  afterEach(async () => {
    await store.clear();
    await store.disconnect();
    processor.removeAllHandlers();
  });

  describe('Intent Detection', () => {
    describe('Pause Commands', () => {
      it('should detect "pause"', () => {
        const intent = processor.detectIntent('pause');
        expect(intent.type).toBe('PAUSE');
        expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
      });

      it('should detect "hold on"', () => {
        const intent = processor.detectIntent('hold on');
        expect(intent.type).toBe('PAUSE');
      });

      it('should detect "wait"', () => {
        const intent = processor.detectIntent('wait');
        expect(intent.type).toBe('PAUSE');
      });

      it('should detect "give me a second"', () => {
        const intent = processor.detectIntent('give me a second');
        expect(intent.type).toBe('PAUSE');
      });
    });

    describe('Resume Commands', () => {
      it('should detect "resume"', () => {
        const intent = processor.detectIntent('resume');
        expect(intent.type).toBe('RESUME');
      });

      it('should detect "continue"', () => {
        const intent = processor.detectIntent('continue');
        expect(intent.type).toBe('RESUME');
      });

      it('should detect "go ahead"', () => {
        const intent = processor.detectIntent('go ahead');
        expect(intent.type).toBe('RESUME');
      });

      it('should detect "okay continue"', () => {
        const intent = processor.detectIntent('okay continue');
        expect(intent.type).toBe('RESUME');
      });
    });

    describe('Skip Commands', () => {
      it('should detect "skip"', () => {
        const intent = processor.detectIntent('skip');
        expect(intent.type).toBe('SKIP');
      });

      it('should detect "skip this"', () => {
        const intent = processor.detectIntent('skip this');
        expect(intent.type).toBe('SKIP');
      });

      it('should detect "next topic"', () => {
        const intent = processor.detectIntent('next topic');
        expect(intent.type).toBe('SKIP');
      });

      it('should detect "move on"', () => {
        const intent = processor.detectIntent('move on');
        expect(intent.type).toBe('SKIP');
      });
    });

    describe('Go Back Commands', () => {
      it('should detect "go back"', () => {
        const intent = processor.detectIntent('go back');
        expect(intent.type).toBe('GO_BACK');
      });

      it('should detect "previous"', () => {
        const intent = processor.detectIntent('previous');
        expect(intent.type).toBe('GO_BACK');
      });

      it('should detect "what was that"', () => {
        const intent = processor.detectIntent('what was that');
        expect(intent.type).toBe('GO_BACK');
      });
    });

    describe('Go Deeper Commands', () => {
      it('should detect "tell me more"', () => {
        const intent = processor.detectIntent('tell me more');
        expect(intent.type).toBe('GO_DEEPER');
      });

      it('should detect "more details"', () => {
        const intent = processor.detectIntent('more details');
        expect(intent.type).toBe('GO_DEEPER');
      });

      it('should detect "expand"', () => {
        const intent = processor.detectIntent('expand');
        expect(intent.type).toBe('GO_DEEPER');
      });

      it('should detect "read the full email"', () => {
        const intent = processor.detectIntent('read the full email');
        expect(intent.type).toBe('GO_DEEPER');
      });
    });

    describe('Next Commands', () => {
      it('should detect "next"', () => {
        const intent = processor.detectIntent('next');
        expect(intent.type).toBe('NEXT');
      });

      it('should detect "next email"', () => {
        const intent = processor.detectIntent('next email');
        expect(intent.type).toBe('NEXT');
      });

      it('should detect "move to next"', () => {
        const intent = processor.detectIntent('move to next');
        expect(intent.type).toBe('NEXT');
      });
    });

    describe('Repeat Commands', () => {
      it('should detect "repeat"', () => {
        const intent = processor.detectIntent('repeat');
        expect(intent.type).toBe('REPEAT');
      });

      it('should detect "say that again"', () => {
        const intent = processor.detectIntent('say that again');
        expect(intent.type).toBe('REPEAT');
      });

      it('should detect "didn\'t catch that"', () => {
        const intent = processor.detectIntent("didn't catch that");
        expect(intent.type).toBe('REPEAT');
      });
    });

    describe('Stop Commands', () => {
      it('should detect "stop"', () => {
        const intent = processor.detectIntent('stop');
        expect(intent.type).toBe('STOP');
      });

      it('should detect "end briefing"', () => {
        const intent = processor.detectIntent('end briefing');
        expect(intent.type).toBe('STOP');
      });

      it('should detect "I\'m done"', () => {
        const intent = processor.detectIntent("I'm done");
        expect(intent.type).toBe('STOP');
      });
    });

    describe('Unknown Commands', () => {
      it('should return UNKNOWN for unrecognized text', () => {
        const intent = processor.detectIntent('hello there');
        expect(intent.type).toBe('UNKNOWN');
        expect(intent.confidence).toBe(0);
      });

      it('should return UNKNOWN for empty text', () => {
        const intent = processor.detectIntent('');
        expect(intent.type).toBe('UNKNOWN');
      });
    });

    describe('Case Insensitivity', () => {
      it('should detect commands regardless of case', () => {
        expect(processor.detectIntent('PAUSE').type).toBe('PAUSE');
        expect(processor.detectIntent('Pause').type).toBe('PAUSE');
        expect(processor.detectIntent('pAuSe').type).toBe('PAUSE');
      });
    });
  });

  describe('Event Processing', () => {
    describe('Basic Processing', () => {
      it('should process pause command', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause the briefing',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const updatedState = await store.get('session-123');
        expect(updatedState?.interruptStatus).toBe(InterruptStatus.PAUSED);
        expect(updatedState?.lastAction?.type).toBe('PAUSE');
      });

      it('should process skip command', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'skip to next topic',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const updatedState = await store.get('session-123');
        expect(updatedState?.position.topicIndex).toBe(1);
        expect(updatedState?.interruptStatus).toBe(InterruptStatus.SKIPPING);
      });

      it('should process next command', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'next email',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const updatedState = await store.get('session-123');
        expect(updatedState?.position.itemIndex).toBe(1);
      });

      it('should process go deeper command', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'tell me more',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const updatedState = await store.get('session-123');
        expect(updatedState?.position.depth).toBe(1);
        expect(updatedState?.interruptStatus).toBe(InterruptStatus.GOING_DEEPER);
      });
    });

    describe('Participant Filtering', () => {
      it('should ignore agent speech', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'agent',
          text: 'pause the briefing',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const state = await store.get('session-123');
        expect(state?.interruptStatus).toBe(InterruptStatus.NONE);
      });

      it('should only process user speech', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const state = await store.get('session-123');
        expect(state?.interruptStatus).toBe(InterruptStatus.PAUSED);
      });
    });

    describe('Interim Transcript Handling', () => {
      it('should skip interim transcripts by default', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: false, // Interim
        };

        await processor.processEvent(event);

        const state = await store.get('session-123');
        expect(state?.interruptStatus).toBe(InterruptStatus.NONE);
      });

      it('should process interim transcripts when enabled', async () => {
        const processorWithInterim = new ShadowProcessor({
          store,
          processInterim: true,
        });

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: false,
        };

        await processorWithInterim.processEvent(event);

        const state = await store.get('session-123');
        expect(state?.interruptStatus).toBe(InterruptStatus.PAUSED);
      });
    });

    describe('Confidence Threshold', () => {
      it('should skip commands below confidence threshold', async () => {
        // Create processor with high threshold
        const strictProcessor = new ShadowProcessor({
          store,
          confidenceThreshold: 0.95,
        });

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'skip', // Confidence 0.85, below 0.95
          timestamp: new Date(),
          isFinal: true,
        };

        await strictProcessor.processEvent(event);

        const state = await store.get('session-123');
        // State should be unchanged
        expect(state?.position.topicIndex).toBe(0);
      });

      it('should process commands above confidence threshold', async () => {
        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause', // Confidence 0.9, above 0.7
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        const state = await store.get('session-123');
        expect(state?.interruptStatus).toBe(InterruptStatus.PAUSED);
      });
    });

    describe('Session Existence', () => {
      it('should handle non-existent session gracefully', async () => {
        const event: TranscriptEvent = {
          sessionId: 'non-existent-session',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        // Should not throw
        await expect(processor.processEvent(event)).resolves.not.toThrow();
      });
    });
  });

  describe('Event Handlers', () => {
    describe('State Change Handler', () => {
      it('should emit stateChange event', async () => {
        const handler = jest.fn();
        processor.on('stateChange', handler);

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        expect(handler).toHaveBeenCalledTimes(1);
        const [sessionId, oldState, newState, transcriptEvent] = handler.mock.calls[0];
        expect(sessionId).toBe('session-123');
        expect(oldState?.interruptStatus).toBe(InterruptStatus.NONE);
        expect(newState.interruptStatus).toBe(InterruptStatus.PAUSED);
        expect(transcriptEvent).toBe(event);
      });

      it('should support multiple state change handlers', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        processor.on('stateChange', handler1);
        processor.on('stateChange', handler2);

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
      });
    });

    describe('Command Detected Handler', () => {
      it('should emit commandDetected event', async () => {
        const handler = jest.fn();
        processor.on('commandDetected', handler);

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        expect(handler).toHaveBeenCalledTimes(1);
        const [sessionId, intent, transcriptEvent] = handler.mock.calls[0];
        expect(sessionId).toBe('session-123');
        expect(intent.type).toBe('PAUSE');
        expect(transcriptEvent).toBe(event);
      });
    });

    describe('Error Handler', () => {
      it('should emit error event on processing error', async () => {
        // Create a processor with a mock store that throws errors
        const mockStore = {
          get: jest.fn().mockResolvedValue(testState),
          update: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
        } as any;

        const errorProcessor = new ShadowProcessor({
          store: mockStore,
        });

        const handler = jest.fn();
        errorProcessor.on('error', handler);

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await expect(errorProcessor.processEvent(event)).rejects.toThrow('Redis connection lost');
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Redis connection lost' }),
          event
        );
      });
    });

    describe('Handler Removal', () => {
      it('should remove specific handler', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        processor.on('stateChange', handler1);
        processor.on('stateChange', handler2);

        processor.off('stateChange', handler1);

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();
      });

      it('should remove all handlers', async () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();
        processor.on('stateChange', handler1);
        processor.on('commandDetected', handler2);

        processor.removeAllHandlers();

        const event: TranscriptEvent = {
          sessionId: 'session-123',
          participant: 'user',
          text: 'pause',
          timestamp: new Date(),
          isFinal: true,
        };

        await processor.processEvent(event);

        expect(handler1).not.toHaveBeenCalled();
        expect(handler2).not.toHaveBeenCalled();
      });
    });
  });

  describe('Custom Patterns', () => {
    it('should support custom command patterns', () => {
      const customProcessor = new ShadowProcessor({
        store,
        customPatterns: [
          {
            type: 'NEXT',
            patterns: [/\bkeep\s+rolling\b/i],
            confidence: 0.8,
          },
        ],
      });

      const intent = customProcessor.detectIntent('keep rolling');
      expect(intent.type).toBe('NEXT');
      expect(intent.confidence).toBe(0.8);
    });

    it('should add pattern dynamically', () => {
      processor.addPattern({
        type: 'NEXT',
        patterns: [/\bkeep\s+it\s+moving\b/i],
        confidence: 0.85,
      });

      const intent = processor.detectIntent('keep it moving');
      expect(intent.type).toBe('NEXT');
    });

    it('should get all patterns', () => {
      const patterns = processor.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.type === 'PAUSE')).toBe(true);
      expect(patterns.some((p) => p.type === 'RESUME')).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle multiple commands in sequence', async () => {
      // Pause
      await processor.processEvent({
        sessionId: 'session-123',
        participant: 'user',
        text: 'pause',
        timestamp: new Date(),
        isFinal: true,
      });

      let state = await store.get('session-123');
      expect(state?.interruptStatus).toBe(InterruptStatus.PAUSED);

      // Resume
      await processor.processEvent({
        sessionId: 'session-123',
        participant: 'user',
        text: 'continue',
        timestamp: new Date(),
        isFinal: true,
      });

      state = await store.get('session-123');
      expect(state?.interruptStatus).toBe(InterruptStatus.RESUMING);

      // Skip
      await processor.processEvent({
        sessionId: 'session-123',
        participant: 'user',
        text: 'skip this topic',
        timestamp: new Date(),
        isFinal: true,
      });

      state = await store.get('session-123');
      expect(state?.position.topicIndex).toBe(1);
    });

    it('should preserve action history', async () => {
      await processor.processEvent({
        sessionId: 'session-123',
        participant: 'user',
        text: 'pause',
        timestamp: new Date(),
        isFinal: true,
      });

      const state = await store.get('session-123');
      expect(state?.lastAction).toBeDefined();
      expect(state?.lastAction?.type).toBe('PAUSE');
      expect(state?.lastAction?.utterance).toBe('pause');
      expect(state?.lastAction?.metadata).toHaveProperty('confidence');
      expect(state?.lastAction?.metadata).toHaveProperty('matchedPattern');
    });
  });
});
