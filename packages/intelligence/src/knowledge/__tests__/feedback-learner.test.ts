/**
 * Tests for FeedbackLearner
 */

import {
  FeedbackLearner,
  type FeedbackType,
  type FeedbackRecord,
  type WeightAdjustments,
  type LearningStats,
} from '../feedback-learner';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FeedbackLearner', () => {
  const testStoragePath = '/tmp/test-feedback';
  let learner: FeedbackLearner;

  beforeEach(() => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(new Error('File not found')); // Default to no existing file

    learner = new FeedbackLearner({
      storagePath: testStoragePath,
      learningRate: 0.1,
      minFeedbackCount: 5,
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(learner).toBeInstanceOf(FeedbackLearner);
    });

    it('should use custom options', () => {
      const customLearner = new FeedbackLearner({
        storagePath: testStoragePath,
        learningRate: 0.2,
        minFeedbackCount: 20,
        maxAdjustment: 0.5,
      });

      expect(customLearner).toBeInstanceOf(FeedbackLearner);
    });
  });

  describe('initialize', () => {
    it('should create storage directory', async () => {
      await learner.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testStoragePath, { recursive: true });
    });

    it('should create new files if none exist', async () => {
      await learner.initialize();

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // feedback.json and stats.json
    });

    it('should load existing data if files exist', async () => {
      const mockFeedback = [
        {
          id: 'feedback-1',
          emailId: 'email-1',
          type: 'correct' as FeedbackType,
          originalScore: 0.8,
          signals: { keyword: 0.9, vip: 0.0, velocity: 0.7, calendar: 0.0 },
          timestamp: new Date().toISOString(),
        },
      ];

      const mockStats = {
        totalFeedback: 1,
        correctCount: 1,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        tooHighCount: 0,
        tooLowCount: 0,
        accuracy: 1.0,
        precision: 1.0,
        weightAdjustments: { keyword: 0, vip: 0, velocity: 0, calendar: 0 },
        lastUpdated: new Date().toISOString(),
      };

      mockFs.readFile
        .mockResolvedValueOnce(JSON.stringify(mockFeedback))
        .mockResolvedValueOnce(JSON.stringify(mockStats));

      await learner.initialize();

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
    });
  });

  describe('recordFeedback', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should record correct feedback', async () => {
      const record = await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.85,
        signals: {
          keyword: 0.9,
          vip: 1.0,
          velocity: 0.7,
          calendar: 0.0,
        },
      });

      expect(record.id).toBeTruthy();
      expect(record.timestamp).toBeInstanceOf(Date);
      expect(record.type).toBe('correct');

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
      expect(stats.correctCount).toBe(1);
    });

    it('should record false positive feedback', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.85,
        signals: {
          keyword: 0.9,
          vip: 0.0,
          velocity: 0.8,
          calendar: 0.0,
        },
      });

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
      expect(stats.falsePositiveCount).toBe(1);
    });

    it('should record false negative feedback', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_negative',
        originalScore: 0.25,
        signals: {
          keyword: 0.3,
          vip: 0.0,
          velocity: 0.2,
          calendar: 0.0,
        },
      });

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
      expect(stats.falseNegativeCount).toBe(1);
    });

    it('should record too_high feedback', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'too_high',
        originalScore: 0.85,
        expectedScore: 0.65,
        signals: {
          keyword: 0.9,
          vip: 0.0,
          velocity: 0.8,
          calendar: 0.0,
        },
      });

      const stats = await learner.getStats();
      expect(stats.tooHighCount).toBe(1);
    });

    it('should record too_low feedback', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'too_low',
        originalScore: 0.45,
        expectedScore: 0.75,
        signals: {
          keyword: 0.5,
          vip: 0.0,
          velocity: 0.4,
          calendar: 0.0,
        },
      });

      const stats = await learner.getStats();
      expect(stats.tooLowCount).toBe(1);
    });

    it('should include optional note', async () => {
      const record = await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.85,
        signals: { keyword: 0.9 },
        note: 'This was actually not urgent',
      });

      expect(record.note).toBe('This was actually not urgent');
    });
  });

  describe('getFeedback', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should get all feedback', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'false_positive',
        originalScore: 0.7,
        signals: { keyword: 0.8 },
      });

      const feedback = await learner.getFeedback();
      expect(feedback.length).toBe(2);
    });

    it('should filter feedback by type', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'false_positive',
        originalScore: 0.7,
        signals: { keyword: 0.8 },
      });

      const filtered = await learner.getFeedback({ type: 'false_positive' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('false_positive');
    });

    it('should apply limit and offset', async () => {
      for (let i = 0; i < 10; i++) {
        await learner.recordFeedback({
          emailId: `email-${i}`,
          type: 'correct',
          originalScore: 0.8,
          signals: { keyword: 0.9 },
        });
      }

      const page1 = await learner.getFeedback({ limit: 3, offset: 0 });
      expect(page1.length).toBe(3);

      const page2 = await learner.getFeedback({ limit: 3, offset: 3 });
      expect(page2.length).toBe(3);
      expect(page2[0].emailId).not.toBe(page1[0].emailId);
    });

    it('should sort by timestamp descending', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      // Wait to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'correct',
        originalScore: 0.7,
        signals: { keyword: 0.8 },
      });

      const feedback = await learner.getFeedback();
      expect(feedback[0].emailId).toBe('email-2'); // Most recent first
      expect(feedback[1].emailId).toBe('email-1');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should calculate accuracy correctly', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'correct',
        originalScore: 0.7,
        signals: { keyword: 0.8 },
      });

      await learner.recordFeedback({
        emailId: 'email-3',
        type: 'false_positive',
        originalScore: 0.6,
        signals: { keyword: 0.7 },
      });

      const stats = await learner.getStats();
      expect(stats.accuracy).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate precision correctly', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'false_positive',
        originalScore: 0.7,
        signals: { keyword: 0.8 },
      });

      await learner.recordFeedback({
        emailId: 'email-3',
        type: 'false_negative',
        originalScore: 0.2,
        signals: { keyword: 0.3 },
      });

      const stats = await learner.getStats();
      expect(stats.precision).toBeCloseTo(1 / 2, 2);
    });

    it('should handle zero precision edge case', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_negative',
        originalScore: 0.2,
        signals: { keyword: 0.3 },
      });

      const stats = await learner.getStats();
      expect(stats.precision).toBe(0);
    });
  });

  describe('weight adjustments', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should not compute adjustments with insufficient feedback', async () => {
      // Record less than minFeedbackCount
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      const adjustments = await learner.getWeightAdjustments();

      // Should still be zero
      expect(adjustments.keyword).toBe(0);
    });

    it('should compute adjustments with sufficient feedback', async () => {
      // Record minFeedbackCount false positives with high keyword signal
      for (let i = 0; i < 5; i++) {
        await learner.recordFeedback({
          emailId: `email-${i}`,
          type: 'false_positive',
          originalScore: 0.85,
          signals: { keyword: 0.9, vip: 0.0, velocity: 0.0, calendar: 0.0 },
        });
      }

      const adjustments = await learner.getWeightAdjustments();

      // Keyword should be negative (we're over-predicting with keyword)
      expect(adjustments.keyword).toBeLessThan(0);
    });

    it('should suggest positive adjustment for false negatives', async () => {
      // Record false negatives with low keyword signal
      for (let i = 0; i < 5; i++) {
        await learner.recordFeedback({
          emailId: `email-${i}`,
          type: 'false_negative',
          originalScore: 0.25,
          signals: { keyword: 0.3, vip: 0.0, velocity: 0.2, calendar: 0.0 },
        });
      }

      const adjustments = await learner.getWeightAdjustments();

      // Should suggest increasing weights (we're under-predicting)
      expect(adjustments.keyword).toBeGreaterThan(0);
      expect(adjustments.velocity).toBeGreaterThan(0);
    });

    it('should respect max adjustment limit', async () => {
      const limitedLearner = new FeedbackLearner({
        storagePath: testStoragePath,
        learningRate: 1.0, // Very high learning rate
        minFeedbackCount: 1,
        maxAdjustment: 0.1, // Low max
      });

      await limitedLearner.initialize();

      await limitedLearner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.95,
        signals: { keyword: 1.0, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      const adjustments = await limitedLearner.getWeightAdjustments();

      expect(Math.abs(adjustments.keyword)).toBeLessThanOrEqual(0.1);
    });

    it('should compute adjustments for multiple signals', async () => {
      for (let i = 0; i < 5; i++) {
        await learner.recordFeedback({
          emailId: `email-${i}`,
          type: 'false_positive',
          originalScore: 0.85,
          signals: { keyword: 0.9, vip: 0.8, velocity: 0.7, calendar: 0.6 },
        });
      }

      const adjustments = await learner.getWeightAdjustments();

      // All should be negative (over-predicting)
      expect(adjustments.keyword).toBeLessThan(0);
      expect(adjustments.vip).toBeLessThan(0);
      expect(adjustments.velocity).toBeLessThan(0);
      expect(adjustments.calendar).toBeLessThan(0);
    });

    it('should handle mixed feedback appropriately', async () => {
      // Mix of correct and incorrect
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      await learner.recordFeedback({
        emailId: 'email-2',
        type: 'correct',
        originalScore: 0.75,
        signals: { keyword: 0.85, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      await learner.recordFeedback({
        emailId: 'email-3',
        type: 'false_positive',
        originalScore: 0.7,
        signals: { keyword: 0.8, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      await learner.recordFeedback({
        emailId: 'email-4',
        type: 'false_positive',
        originalScore: 0.65,
        signals: { keyword: 0.75, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      await learner.recordFeedback({
        emailId: 'email-5',
        type: 'false_negative',
        originalScore: 0.3,
        signals: { keyword: 0.4, vip: 0.0, velocity: 0.0, calendar: 0.0 },
      });

      const adjustments = await learner.getWeightAdjustments();

      // Should be relatively small (mixed signals)
      expect(Math.abs(adjustments.keyword)).toBeLessThan(0.3);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should clear all feedback and reset stats', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      await learner.clear();

      const feedback = await learner.getFeedback();
      expect(feedback.length).toBe(0);

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(0);
      expect(stats.correctCount).toBe(0);
    });
  });

  describe('persistence', () => {
    it('should save feedback and stats to files', async () => {
      await learner.initialize();

      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 0.8,
        signals: { keyword: 0.9 },
      });

      // Should write twice: once for init, once for recordFeedback
      expect(mockFs.writeFile).toHaveBeenCalled();

      const calls = mockFs.writeFile.mock.calls;
      const feedbackCalls = calls.filter((c) => c[0].toString().includes('feedback.json'));
      const statsCalls = calls.filter((c) => c[0].toString().includes('stats.json'));

      expect(feedbackCalls.length).toBeGreaterThan(0);
      expect(statsCalls.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await learner.initialize();
    });

    it('should handle feedback with zero signals', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.5,
        signals: {},
      });

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
    });

    it('should handle undefined signal values', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_positive',
        originalScore: 0.5,
        signals: { keyword: 0.9 },
      });

      const adjustments = await learner.getWeightAdjustments();
      expect(adjustments).toBeDefined();
    });

    it('should handle feedback with score 0', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'false_negative',
        originalScore: 0.0,
        signals: { keyword: 0.0 },
      });

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
    });

    it('should handle feedback with score 1', async () => {
      await learner.recordFeedback({
        emailId: 'email-1',
        type: 'correct',
        originalScore: 1.0,
        signals: { keyword: 1.0 },
      });

      const stats = await learner.getStats();
      expect(stats.totalFeedback).toBe(1);
    });
  });
});
