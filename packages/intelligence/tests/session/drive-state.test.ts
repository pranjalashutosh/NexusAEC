/**
 * Tests for DriveState types and helper functions
 */

import {
  type DriveState,
  type BriefingPosition,
  type UserAction,
  type CreateDriveStateOptions,
  type UpdateDriveStateOptions,
  InterruptStatus,
  createInitialDriveState,
  updateDriveState,
  navigateToNextItem,
  navigateToPreviousItem,
  skipCurrentTopic,
  goDeeper,
  isBriefingComplete,
  getProgressPercentage,
  validateDriveState,
} from '../../src/session/drive-state';

describe('DriveState Types', () => {
  describe('createInitialDriveState', () => {
    it('should create initial state with first topic and item', () => {
      const options: CreateDriveStateOptions = {
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2', 'topic-3'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3'],
          'topic-2': ['email-4', 'email-5'],
          'topic-3': ['email-6'],
        },
        sources: ['OUTLOOK', 'GMAIL'],
        clientType: 'mobile',
        clientVersion: '1.0.0',
      };

      const state = createInitialDriveState(options);

      expect(state.sessionId).toBe('session-123');
      expect(state.userId).toBe('user-456');
      expect(state.position.topicIndex).toBe(0);
      expect(state.position.itemIndex).toBe(0);
      expect(state.position.totalTopics).toBe(3);
      expect(state.position.totalItemsInTopic).toBe(3);
      expect(state.position.itemsRemaining).toBe(6);
      expect(state.position.currentTopicId).toBe('topic-1');
      expect(state.position.currentEmailId).toBe('email-1');
      expect(state.position.depth).toBe(0);
      expect(state.interruptStatus).toBe(InterruptStatus.NONE);
      expect(state.briefingSnapshot.topicIds).toEqual(['topic-1', 'topic-2', 'topic-3']);
      expect(state.briefingSnapshot.totalEmails).toBe(6);
      expect(state.metadata.roomName).toBe('briefing-room-1');
      expect(state.metadata.sources).toEqual(['OUTLOOK', 'GMAIL']);
      expect(state.metadata.clientType).toBe('mobile');
      expect(state.ttl).toBe(86400);
    });

    it('should handle empty topics', () => {
      const options: CreateDriveStateOptions = {
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: [],
        topicEmailMap: {},
        sources: ['OUTLOOK'],
      };

      const state = createInitialDriveState(options);

      expect(state.position.totalTopics).toBe(0);
      expect(state.position.itemsRemaining).toBe(0);
      expect(state.position.currentTopicId).toBeUndefined();
      expect(state.position.currentEmailId).toBeUndefined();
    });

    it('should use custom TTL when provided', () => {
      const options: CreateDriveStateOptions = {
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: { 'topic-1': ['email-1'] },
        sources: ['OUTLOOK'],
        ttl: 3600, // 1 hour
      };

      const state = createInitialDriveState(options);

      expect(state.ttl).toBe(3600);
    });
  });

  describe('updateDriveState', () => {
    let baseState: DriveState;

    beforeEach(() => {
      baseState = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2'],
          'topic-2': ['email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });
    });

    it('should update position fields', () => {
      const updates: UpdateDriveStateOptions = {
        position: {
          itemIndex: 1,
          depth: 1,
        },
      };

      const updatedState = updateDriveState(baseState, updates);

      expect(updatedState.position.itemIndex).toBe(1);
      expect(updatedState.position.depth).toBe(1);
      expect(updatedState.position.topicIndex).toBe(0); // Unchanged
      expect(updatedState.updatedAt.getTime()).toBeGreaterThanOrEqual(
        baseState.updatedAt.getTime()
      );
    });

    it('should update interrupt status', () => {
      const updates: UpdateDriveStateOptions = {
        interruptStatus: InterruptStatus.PAUSED,
      };

      const updatedState = updateDriveState(baseState, updates);

      expect(updatedState.interruptStatus).toBe(InterruptStatus.PAUSED);
    });

    it('should update last action', () => {
      const action: UserAction = {
        type: 'PAUSE',
        timestamp: new Date(),
        utterance: 'pause briefing',
      };

      const updates: UpdateDriveStateOptions = {
        lastAction: action,
      };

      const updatedState = updateDriveState(baseState, updates);

      expect(updatedState.lastAction).toEqual(action);
    });

    it('should update multiple fields at once', () => {
      const updates: UpdateDriveStateOptions = {
        position: { itemIndex: 1 },
        interruptStatus: InterruptStatus.USER_INTERRUPT,
        lastAction: {
          type: 'INTERRUPT',
          timestamp: new Date(),
        },
      };

      const updatedState = updateDriveState(baseState, updates);

      expect(updatedState.position.itemIndex).toBe(1);
      expect(updatedState.interruptStatus).toBe(InterruptStatus.USER_INTERRUPT);
      expect(updatedState.lastAction?.type).toBe('INTERRUPT');
    });
  });

  describe('navigateToNextItem', () => {
    it('should move to next item in same topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3'],
        },
        sources: ['OUTLOOK'],
      });

      const nextState = navigateToNextItem(state);

      expect(nextState.position.topicIndex).toBe(0);
      expect(nextState.position.itemIndex).toBe(1);
      expect(nextState.position.currentEmailId).toBe('email-2');
      expect(nextState.position.itemsRemaining).toBe(2);
      expect(nextState.position.depth).toBe(0); // Reset depth
    });

    it('should move to next topic when current topic complete', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2'],
          'topic-2': ['email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });

      // Move to last item in topic-1
      let nextState = navigateToNextItem(state);
      expect(nextState.position.itemIndex).toBe(1);
      expect(nextState.position.currentEmailId).toBe('email-2');

      // Move to first item in topic-2
      nextState = navigateToNextItem(nextState);
      expect(nextState.position.topicIndex).toBe(1);
      expect(nextState.position.itemIndex).toBe(0);
      expect(nextState.position.currentTopicId).toBe('topic-2');
      expect(nextState.position.currentEmailId).toBe('email-3');
      expect(nextState.position.totalItemsInTopic).toBe(2);
    });

    it('should stay at same position when briefing complete', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1'],
        },
        sources: ['OUTLOOK'],
      });

      const nextState = navigateToNextItem(state);

      // Should not change since already at last item
      expect(nextState.position.topicIndex).toBe(0);
      expect(nextState.position.itemIndex).toBe(0);
    });

    it('should reset depth when moving to new item', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2'],
        },
        sources: ['OUTLOOK'],
      });

      // Set depth to 2
      const deepState = updateDriveState(state, {
        position: { depth: 2 },
      });

      const nextState = navigateToNextItem(deepState);

      expect(nextState.position.depth).toBe(0);
    });
  });

  describe('navigateToPreviousItem', () => {
    it('should move to previous item in same topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3'],
        },
        sources: ['OUTLOOK'],
      });

      // Move to item 2
      const state2 = navigateToNextItem(navigateToNextItem(state));
      expect(state2.position.itemIndex).toBe(2);

      // Go back to item 1
      const prevState = navigateToPreviousItem(state2);
      expect(prevState.position.itemIndex).toBe(1);
      expect(prevState.position.currentEmailId).toBe('email-2');
      expect(prevState.position.itemsRemaining).toBe(2);
    });

    it('should move to previous topic when at first item', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2'],
          'topic-2': ['email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });

      // Navigate to topic-2, item 0
      const state2 = navigateToNextItem(navigateToNextItem(state));
      expect(state2.position.topicIndex).toBe(1);
      expect(state2.position.itemIndex).toBe(0);

      // Go back to topic-1, last item
      const prevState = navigateToPreviousItem(state2);
      expect(prevState.position.topicIndex).toBe(0);
      expect(prevState.position.itemIndex).toBe(1);
      expect(prevState.position.currentTopicId).toBe('topic-1');
      expect(prevState.position.currentEmailId).toBe('email-2');
    });

    it('should stay at same position when at beginning', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1'],
        },
        sources: ['OUTLOOK'],
      });

      const prevState = navigateToPreviousItem(state);

      expect(prevState.position.topicIndex).toBe(0);
      expect(prevState.position.itemIndex).toBe(0);
    });
  });

  describe('skipCurrentTopic', () => {
    it('should skip to next topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2', 'topic-3'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3'],
          'topic-2': ['email-4', 'email-5'],
          'topic-3': ['email-6'],
        },
        sources: ['OUTLOOK'],
      });

      const skippedState = skipCurrentTopic(state);

      expect(skippedState.position.topicIndex).toBe(1);
      expect(skippedState.position.itemIndex).toBe(0);
      expect(skippedState.position.currentTopicId).toBe('topic-2');
      expect(skippedState.position.currentEmailId).toBe('email-4');
      expect(skippedState.position.itemsRemaining).toBe(3); // 6 - 3 skipped
      expect(skippedState.interruptStatus).toBe(InterruptStatus.SKIPPING);
      expect(skippedState.lastAction?.type).toBe('SKIP');
      expect(skippedState.lastAction?.target).toBe('topic-1');
    });

    it('should update items remaining when skipping from middle of topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3'],
          'topic-2': ['email-4', 'email-5'],
        },
        sources: ['OUTLOOK'],
      });

      // Move to item 1 in topic 1
      const state2 = navigateToNextItem(state);
      expect(state2.position.itemIndex).toBe(1);
      expect(state2.position.itemsRemaining).toBe(4);

      // Skip to topic 2
      const skippedState = skipCurrentTopic(state2);

      expect(skippedState.position.topicIndex).toBe(1);
      expect(skippedState.position.itemsRemaining).toBe(2); // 4 - 2 remaining in topic-1
    });

    it('should stay at same position when at last topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1'],
          'topic-2': ['email-2'],
        },
        sources: ['OUTLOOK'],
      });

      // Navigate to last topic
      const state2 = navigateToNextItem(state);

      // Try to skip
      const skippedState = skipCurrentTopic(state2);

      expect(skippedState.position.topicIndex).toBe(1); // Same position
    });
  });

  describe('goDeeper', () => {
    it('should increase depth level', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1'],
        },
        sources: ['OUTLOOK'],
      });

      const deeperState = goDeeper(state);

      expect(deeperState.position.depth).toBe(1);
      expect(deeperState.interruptStatus).toBe(InterruptStatus.GOING_DEEPER);
      expect(deeperState.lastAction?.type).toBe('GO_DEEPER');
      expect(deeperState.lastAction?.metadata?.depth).toBe(1);
    });

    it('should increase depth up to maximum (2)', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1'],
        },
        sources: ['OUTLOOK'],
      });

      const depth1 = goDeeper(state);
      expect(depth1.position.depth).toBe(1);

      const depth2 = goDeeper(depth1);
      expect(depth2.position.depth).toBe(2);

      // Try to go deeper again
      const depth3 = goDeeper(depth2);
      expect(depth3.position.depth).toBe(2); // Should stay at 2
    });
  });

  describe('isBriefingComplete', () => {
    it('should return false when at beginning', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2'],
          'topic-2': ['email-3'],
        },
        sources: ['OUTLOOK'],
      });

      expect(isBriefingComplete(state)).toBe(false);
    });

    it('should return false when in middle', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2', 'topic-3'],
        topicEmailMap: {
          'topic-1': ['email-1'],
          'topic-2': ['email-2'],
          'topic-3': ['email-3'],
        },
        sources: ['OUTLOOK'],
      });

      const state2 = navigateToNextItem(state);
      expect(isBriefingComplete(state2)).toBe(false);
    });

    it('should return true when at last item of last topic', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1', 'topic-2'],
        topicEmailMap: {
          'topic-1': ['email-1'],
          'topic-2': ['email-2', 'email-3'],
        },
        sources: ['OUTLOOK'],
      });

      // Navigate to last item
      const state2 = navigateToNextItem(state);
      const state3 = navigateToNextItem(state2);

      expect(isBriefingComplete(state3)).toBe(true);
    });

    it('should return true for empty briefing', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: [],
        topicEmailMap: {},
        sources: ['OUTLOOK'],
      });

      // Empty briefing is considered complete (nothing to brief)
      expect(isBriefingComplete(state)).toBe(true);
    });
  });

  describe('getProgressPercentage', () => {
    it('should return 0 at beginning', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });

      expect(getProgressPercentage(state)).toBe(0);
    });

    it('should return 50 at halfway point', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });

      // Process 2 of 4 items
      const state2 = navigateToNextItem(navigateToNextItem(state));

      expect(getProgressPercentage(state2)).toBe(50);
    });

    it('should calculate progress correctly', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1', 'email-2', 'email-3', 'email-4'],
        },
        sources: ['OUTLOOK'],
      });

      // Initial state: 0 processed, 4 remaining
      expect(getProgressPercentage(state)).toBe(0);

      // After 1st item: 1 processed, 3 remaining
      const state2 = navigateToNextItem(state);
      expect(getProgressPercentage(state2)).toBe(25);

      // After 2nd item: 2 processed, 2 remaining
      const state3 = navigateToNextItem(state2);
      expect(getProgressPercentage(state3)).toBe(50);

      // After 3rd item: 3 processed, 1 remaining
      const state4 = navigateToNextItem(state3);
      expect(getProgressPercentage(state4)).toBe(75);
    });

    it('should return 100 for empty briefing', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: [],
        topicEmailMap: {},
        sources: ['OUTLOOK'],
      });

      expect(getProgressPercentage(state)).toBe(100);
    });
  });

  describe('validateDriveState', () => {
    it('should validate valid drive state', () => {
      const state = createInitialDriveState({
        sessionId: 'session-123',
        userId: 'user-456',
        roomName: 'briefing-room-1',
        topicIds: ['topic-1'],
        topicEmailMap: {
          'topic-1': ['email-1'],
        },
        sources: ['OUTLOOK'],
      });

      expect(validateDriveState(state)).toBe(true);
    });

    it('should reject null', () => {
      expect(validateDriveState(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateDriveState(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateDriveState('not an object')).toBe(false);
      expect(validateDriveState(123)).toBe(false);
    });

    it('should reject object missing required fields', () => {
      const invalid = {
        sessionId: 'session-123',
        // Missing userId and other required fields
      };

      expect(validateDriveState(invalid)).toBe(false);
    });

    it('should reject object with invalid field types', () => {
      const invalid = {
        sessionId: 123, // Should be string
        userId: 'user-456',
        position: {},
        interruptStatus: InterruptStatus.NONE,
        startedAt: new Date(),
        updatedAt: new Date(),
        briefingSnapshot: {},
        metadata: {},
        ttl: 86400,
      };

      expect(validateDriveState(invalid)).toBe(false);
    });
  });
});
