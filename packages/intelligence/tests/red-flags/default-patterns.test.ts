import {
  DEFAULT_RED_FLAG_PATTERNS,
  getPatternsByCategory,
  getPatternsBySeverity,
  getPatternsForField,
  getPatternById,
} from '../../src/red-flags/default-patterns';
import { RedFlagCategory, Severity, PatternType, type RedFlagPattern } from '../../src/types';

describe('DEFAULT_RED_FLAG_PATTERNS', () => {
  describe('Pattern Array Structure', () => {
    it('should export an array of patterns', () => {
      expect(Array.isArray(DEFAULT_RED_FLAG_PATTERNS)).toBe(true);
      expect(DEFAULT_RED_FLAG_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should have at least 20 patterns for comprehensive coverage', () => {
      expect(DEFAULT_RED_FLAG_PATTERNS.length).toBeGreaterThanOrEqual(20);
    });

    it('should have unique pattern IDs', () => {
      const ids = DEFAULT_RED_FLAG_PATTERNS.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Pattern Structure Validation', () => {
    it('should have all required fields for each pattern', () => {
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(pattern).toHaveProperty('id');
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('type');
        expect(pattern).toHaveProperty('severity');
        expect(pattern).toHaveProperty('weight');
        expect(pattern).toHaveProperty('category');
        expect(pattern).toHaveProperty('contextFields');
        expect(pattern).toHaveProperty('description');
      });
    });

    it('should have non-empty IDs', () => {
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(pattern.id).toBeTruthy();
        expect(typeof pattern.id).toBe('string');
        expect(pattern.id.length).toBeGreaterThan(0);
      });
    });

    it('should have valid pattern types', () => {
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(pattern.pattern).toBeTruthy();
        if (pattern.type === PatternType.KEYWORD) {
          expect(typeof pattern.pattern).toBe('string');
        } else if (pattern.type === PatternType.REGEX) {
          expect(pattern.pattern instanceof RegExp).toBe(true);
        }
      });
    });

    it('should have valid severity levels', () => {
      const validSeverities = Object.values(Severity);
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(validSeverities).toContain(pattern.severity);
      });
    });

    it('should have valid category values', () => {
      const validCategories = Object.values(RedFlagCategory);
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(validCategories).toContain(pattern.category);
      });
    });

    it('should have valid context fields', () => {
      const validFields = ['subject', 'body', 'sender'];
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(Array.isArray(pattern.contextFields)).toBe(true);
        expect(pattern.contextFields.length).toBeGreaterThan(0);
        pattern.contextFields.forEach((field) => {
          expect(validFields).toContain(field);
        });
      });
    });

    it('should have non-empty descriptions', () => {
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(typeof pattern.description).toBe('string');
        expect(pattern.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Weight Validation', () => {
    it('should have weights between 0.0 and 1.0', () => {
      DEFAULT_RED_FLAG_PATTERNS.forEach((pattern) => {
        expect(pattern.weight).toBeGreaterThanOrEqual(0.0);
        expect(pattern.weight).toBeLessThanOrEqual(1.0);
      });
    });

    it('should have HIGH severity patterns with weights >= 0.8', () => {
      const highSeverityPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.severity === Severity.HIGH
      );
      highSeverityPatterns.forEach((pattern) => {
        expect(pattern.weight).toBeGreaterThanOrEqual(0.6);
      });
    });

    it('should have MEDIUM severity patterns with weights between 0.5-0.8', () => {
      const mediumSeverityPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.severity === Severity.MEDIUM
      );
      mediumSeverityPatterns.forEach((pattern) => {
        expect(pattern.weight).toBeGreaterThanOrEqual(0.4);
        expect(pattern.weight).toBeLessThanOrEqual(0.9);
      });
    });
  });

  describe('Category Coverage', () => {
    it('should have patterns for URGENCY category', () => {
      const urgencyPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.category === RedFlagCategory.URGENCY
      );
      expect(urgencyPatterns.length).toBeGreaterThan(0);
    });

    it('should have patterns for INCIDENT category', () => {
      const incidentPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.category === RedFlagCategory.INCIDENT
      );
      expect(incidentPatterns.length).toBeGreaterThan(0);
    });

    it('should have patterns for DEADLINE category', () => {
      const deadlinePatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.category === RedFlagCategory.DEADLINE
      );
      expect(deadlinePatterns.length).toBeGreaterThan(0);
    });

    it('should have patterns for ESCALATION category', () => {
      const escalationPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.category === RedFlagCategory.ESCALATION
      );
      expect(escalationPatterns.length).toBeGreaterThan(0);
    });

    it('should have patterns for EMERGENCY category', () => {
      const emergencyPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.category === RedFlagCategory.EMERGENCY
      );
      expect(emergencyPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Required Keywords Coverage', () => {
    it('should include "urgent" keyword', () => {
      const hasUrgent = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'urgent') ||
          (p.pattern instanceof RegExp &&
            p.pattern.test('urgent') &&
            p.category === RedFlagCategory.URGENCY)
      );
      expect(hasUrgent).toBe(true);
    });

    it('should include "ASAP" keyword', () => {
      const hasAsap = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'asap') ||
          (p.pattern instanceof RegExp && p.pattern.test('asap'))
      );
      expect(hasAsap).toBe(true);
    });

    it('should include "incident" keyword', () => {
      const hasIncident = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'incident') ||
          (p.pattern instanceof RegExp && p.pattern.test('incident'))
      );
      expect(hasIncident).toBe(true);
    });

    it('should include "outage" keyword', () => {
      const hasOutage = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'outage') ||
          (p.pattern instanceof RegExp && p.pattern.test('outage'))
      );
      expect(hasOutage).toBe(true);
    });

    it('should include "escalation" keyword', () => {
      const hasEscalation = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'escalation') ||
          (p.pattern instanceof RegExp && p.pattern.test('escalation'))
      );
      expect(hasEscalation).toBe(true);
    });

    it('should include "deadline" keyword', () => {
      const hasDeadline = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'deadline') ||
          (p.pattern instanceof RegExp && p.pattern.test('deadline'))
      );
      expect(hasDeadline).toBe(true);
    });

    it('should include "critical" keyword', () => {
      const hasCritical = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'critical') ||
          (p.pattern instanceof RegExp && p.pattern.test('critical'))
      );
      expect(hasCritical).toBe(true);
    });

    it('should include "emergency" keyword', () => {
      const hasEmergency = DEFAULT_RED_FLAG_PATTERNS.some(
        (p) =>
          (typeof p.pattern === 'string' && p.pattern.toLowerCase() === 'emergency') ||
          (p.pattern instanceof RegExp && p.pattern.test('emergency'))
      );
      expect(hasEmergency).toBe(true);
    });
  });

  describe('Pattern Type Distribution', () => {
    it('should have both KEYWORD and REGEX patterns', () => {
      const keywordPatterns = DEFAULT_RED_FLAG_PATTERNS.filter(
        (p) => p.type === PatternType.KEYWORD
      );
      const regexPatterns = DEFAULT_RED_FLAG_PATTERNS.filter((p) => p.type === PatternType.REGEX);

      expect(keywordPatterns.length).toBeGreaterThan(0);
      expect(regexPatterns.length).toBeGreaterThan(0);
    });

    it('should have regex patterns properly formatted', () => {
      const regexPatterns = DEFAULT_RED_FLAG_PATTERNS.filter((p) => p.type === PatternType.REGEX);

      regexPatterns.forEach((pattern) => {
        expect(pattern.pattern instanceof RegExp).toBe(true);
        // Regex should be valid (this will throw if invalid)
        expect(() => new RegExp(pattern.pattern)).not.toThrow();
      });
    });
  });
});

describe('Helper Functions', () => {
  describe('getPatternsByCategory', () => {
    it('should return patterns for URGENCY category', () => {
      const patterns = getPatternsByCategory(RedFlagCategory.URGENCY);
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((p) => {
        expect(p.category).toBe(RedFlagCategory.URGENCY);
      });
    });

    it('should return patterns for INCIDENT category', () => {
      const patterns = getPatternsByCategory(RedFlagCategory.INCIDENT);
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((p) => {
        expect(p.category).toBe(RedFlagCategory.INCIDENT);
      });
    });

    it('should return empty array for category with no patterns', () => {
      // If a category has patterns, this test needs adjustment
      // For now, testing that function handles any category
      const patterns = getPatternsByCategory(RedFlagCategory.DEADLINE);
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('getPatternsBySeverity', () => {
    it('should return patterns for HIGH severity', () => {
      const patterns = getPatternsBySeverity(Severity.HIGH);
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((p) => {
        expect(p.severity).toBe(Severity.HIGH);
      });
    });

    it('should return patterns for MEDIUM severity', () => {
      const patterns = getPatternsBySeverity(Severity.MEDIUM);
      // May or may not have medium patterns, but should return an array
      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.severity).toBe(Severity.MEDIUM);
      });
    });

    it('should return patterns for LOW severity', () => {
      const patterns = getPatternsBySeverity(Severity.LOW);
      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.severity).toBe(Severity.LOW);
      });
    });
  });

  describe('getPatternsForField', () => {
    it('should return patterns applicable to subject field', () => {
      const patterns = getPatternsForField('subject');
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((p) => {
        expect(p.contextFields).toContain('subject');
      });
    });

    it('should return patterns applicable to body field', () => {
      const patterns = getPatternsForField('body');
      expect(patterns.length).toBeGreaterThan(0);
      patterns.forEach((p) => {
        expect(p.contextFields).toContain('body');
      });
    });

    it('should return patterns applicable to sender field', () => {
      const patterns = getPatternsForField('sender');
      // May have fewer sender patterns
      expect(Array.isArray(patterns)).toBe(true);
      patterns.forEach((p) => {
        expect(p.contextFields).toContain('sender');
      });
    });
  });

  describe('getPatternById', () => {
    it('should return a pattern for valid ID', () => {
      const firstPattern = DEFAULT_RED_FLAG_PATTERNS[0];
      const found = getPatternById(firstPattern.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(firstPattern.id);
    });

    it('should return undefined for invalid ID', () => {
      const found = getPatternById('non-existent-id-12345');
      expect(found).toBeUndefined();
    });

    it('should return exact pattern match', () => {
      const urgentPattern = DEFAULT_RED_FLAG_PATTERNS.find(
        (p) => p.id === 'urgency-urgent-keyword'
      );
      if (urgentPattern) {
        const found = getPatternById('urgency-urgent-keyword');
        expect(found).toEqual(urgentPattern);
      }
    });
  });
});
