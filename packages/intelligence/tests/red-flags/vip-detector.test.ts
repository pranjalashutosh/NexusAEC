import type { StandardEmail, VIP, Contact } from '@nexus-aec/shared-types';
import {
  VipDetector,
  type VipDetectorOptions,
} from '../../src/red-flags/vip-detector';

// Helper to create test emails
function createTestEmail(overrides: Partial<StandardEmail> = {}): StandardEmail {
  return {
    id: 'test-email-1',
    threadId: 'test-thread-1',
    source: 'GMAIL',
    from: { email: 'sender@example.com', name: 'Test Sender' },
    to: [{ email: 'recipient@example.com', name: 'Test Recipient' }],
    subject: 'Test Subject',
    snippet: 'Test snippet',
    body: 'Test body content',
    receivedAt: new Date(),
    isRead: false,
    isStarred: false,
    labels: [],
    ...overrides,
  };
}

// Helper to create test VIP
function createTestVip(overrides: Partial<VIP> = {}): VIP {
  return {
    id: 'vip-1',
    email: 'vip@example.com',
    name: 'VIP Person',
    addedAt: new Date(),
    source: 'manual',
    ...overrides,
  };
}

// Helper to create test contact
function createTestContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    source: 'GMAIL',
    email: 'contact@example.com',
    name: 'Test Contact',
    interactionCount: 10,
    lastInteractionAt: new Date(),
    ...overrides,
  };
}

describe('VipDetector', () => {
  describe('Constructor and Configuration', () => {
    it('should create detector with default options', () => {
      const detector = new VipDetector();
      expect(detector).toBeInstanceOf(VipDetector);
      expect(detector.getVipList()).toEqual([]);
      expect(detector.getContacts()).toEqual([]);
    });

    it('should create detector with VIP list', () => {
      const vipList = [createTestVip()];
      const detector = new VipDetector({ vipList });
      expect(detector.getVipList()).toHaveLength(1);
    });

    it('should create detector with contacts', () => {
      const contacts = [createTestContact()];
      const detector = new VipDetector({ contacts });
      expect(detector.getContacts()).toHaveLength(1);
    });

    it('should create detector with custom options', () => {
      const options: VipDetectorOptions = {
        vipMatchWeight: 0.9,
        highInteractionThreshold: 100,
      };
      const detector = new VipDetector({}, options);
      const detectorOptions = detector.getOptions();
      expect(detectorOptions.vipMatchWeight).toBe(0.9);
      expect(detectorOptions.highInteractionThreshold).toBe(100);
    });
  });

  describe('VIP List Matching', () => {
    it('should detect explicit VIP from list', () => {
      const vip = createTestVip({ email: 'vip@example.com' });
      const detector = new VipDetector({ vipList: [vip] });
      const email = createTestEmail({ from: { email: 'vip@example.com', name: 'VIP' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(true);
      expect(result.vipEntry).toEqual(vip);
      expect(result.score).toBeGreaterThanOrEqual(0.8);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]?.type).toBe('explicit_vip');
    });

    it('should match VIP email case-insensitively', () => {
      const vip = createTestVip({ email: 'VIP@EXAMPLE.COM' });
      const detector = new VipDetector({ vipList: [vip] });
      const email = createTestEmail({ from: { email: 'vip@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(true);
      expect(result.vipEntry).toEqual(vip);
    });

    it('should handle email with whitespace', () => {
      const vip = createTestVip({ email: ' vip@example.com ' });
      const detector = new VipDetector({ vipList: [vip] });
      const email = createTestEmail({ from: { email: '  vip@example.com  ' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(true);
    });

    it('should not detect VIP when not in list', () => {
      const vip = createTestVip({ email: 'vip@example.com' });
      const detector = new VipDetector({ vipList: [vip] });
      const email = createTestEmail({ from: { email: 'other@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(false);
      expect(result.vipEntry).toBeUndefined();
      expect(result.score).toBe(0);
    });
  });

  describe('Interaction Frequency Detection', () => {
    it('should detect high interaction frequency', () => {
      const contact = createTestContact({
        email: 'frequent@example.com',
        interactionCount: 60,
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'frequent@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(true);
      expect(result.contact).toEqual(contact);
      expect(result.score).toBeGreaterThanOrEqual(0.6);
      const highInteraction = result.reasons.find((r) => r.type === 'high_interaction');
      expect(highInteraction).toBeDefined();
    });

    it('should detect medium interaction frequency', () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 30);

      const contact = createTestContact({
        email: 'medium@example.com',
        interactionCount: 30,
        lastInteractionAt: longAgo, // No recency boost
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'medium@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(false); // Below 0.5 threshold
      expect(result.score).toBeGreaterThanOrEqual(0.4);
      const mediumInteraction = result.reasons.find((r) => r.type === 'medium_interaction');
      expect(mediumInteraction).toBeDefined();
    });

    it('should not give interaction weight for low frequency', () => {
      const contact = createTestContact({
        email: 'low@example.com',
        interactionCount: 5,
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'low@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(false);
      const interactions = result.reasons.filter(
        (r) => r.type === 'high_interaction' || r.type === 'medium_interaction'
      );
      expect(interactions).toHaveLength(0);
    });

    it('should use custom interaction thresholds', () => {
      const contact = createTestContact({
        email: 'custom@example.com',
        interactionCount: 15,
      });
      const detector = new VipDetector(
        { contacts: [contact] },
        { mediumInteractionThreshold: 10 }
      );
      const email = createTestEmail({ from: { email: 'custom@example.com' } });

      const result = detector.detectVip(email);

      const mediumInteraction = result.reasons.find((r) => r.type === 'medium_interaction');
      expect(mediumInteraction).toBeDefined();
    });
  });

  describe('Recency Boost', () => {
    it('should apply recency boost for recent interactions', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const contact = createTestContact({
        email: 'recent@example.com',
        lastInteractionAt: yesterday,
        interactionCount: 5,
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'recent@example.com' } });

      const result = detector.detectVip(email);

      const recentBoost = result.reasons.find((r) => r.type === 'recent_interaction');
      expect(recentBoost).toBeDefined();
      expect(recentBoost?.weight).toBe(0.2);
    });

    it('should not apply recency boost for old interactions', () => {
      const longAgo = new Date();
      longAgo.setDate(longAgo.getDate() - 30);

      const contact = createTestContact({
        email: 'old@example.com',
        lastInteractionAt: longAgo,
        interactionCount: 5,
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'old@example.com' } });

      const result = detector.detectVip(email);

      const recentBoost = result.reasons.find((r) => r.type === 'recent_interaction');
      expect(recentBoost).toBeUndefined();
    });

    it('should use custom recency settings', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const contact = createTestContact({
        email: 'recent@example.com',
        lastInteractionAt: threeDaysAgo,
      });
      const detector = new VipDetector(
        { contacts: [contact] },
        { recencyBoostDays: 5, recencyBoostMultiplier: 0.3 }
      );
      const email = createTestEmail({ from: { email: 'recent@example.com' } });

      const result = detector.detectVip(email);

      const recentBoost = result.reasons.find((r) => r.type === 'recent_interaction');
      expect(recentBoost).toBeDefined();
      expect(recentBoost?.weight).toBe(0.3);
    });
  });

  describe('Job Title Detection', () => {
    it('should detect VIP from CEO title', () => {
      const contact = createTestContact({
        email: 'ceo@example.com',
        jobTitle: 'Chief Executive Officer',
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'ceo@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeDefined();
      expect(titleReason?.description).toContain('Chief Executive Officer');
    });

    it('should detect VIP from CTO title', () => {
      const contact = createTestContact({
        email: 'cto@example.com',
        jobTitle: 'CTO',
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'cto@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeDefined();
    });

    it('should detect VIP from VP title', () => {
      const contact = createTestContact({
        email: 'vp@example.com',
        jobTitle: 'Vice President of Engineering',
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'vp@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeDefined();
    });

    it('should detect VIP from Director title', () => {
      const contact = createTestContact({
        email: 'director@example.com',
        jobTitle: 'Director of Product',
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'director@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeDefined();
    });

    it('should not detect VIP from non-executive title', () => {
      const contact = createTestContact({
        email: 'engineer@example.com',
        jobTitle: 'Software Engineer',
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'engineer@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeUndefined();
    });
  });

  describe('Combined Scoring', () => {
    it('should combine multiple VIP signals', () => {
      const vip = createTestVip({ email: 'super-vip@example.com' });
      const contact = createTestContact({
        email: 'super-vip@example.com',
        interactionCount: 100,
        lastInteractionAt: new Date(),
        jobTitle: 'CEO',
      });
      const detector = new VipDetector({ vipList: [vip], contacts: [contact] });
      const email = createTestEmail({ from: { email: 'super-vip@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(true);
      expect(result.score).toBeLessThanOrEqual(1.0); // Capped at 1.0
      expect(result.reasons.length).toBeGreaterThan(1);

      // Should have multiple reasons
      expect(result.reasons.some((r) => r.type === 'explicit_vip')).toBe(true);
      expect(result.reasons.some((r) => r.type === 'high_interaction')).toBe(true);
      expect(result.reasons.some((r) => r.type === 'recent_interaction')).toBe(true);
      expect(result.reasons.some((r) => r.type === 'job_title')).toBe(true);
    });

    it('should cap score at 1.0', () => {
      const vip = createTestVip({ email: 'max@example.com' });
      const contact = createTestContact({
        email: 'max@example.com',
        interactionCount: 200,
        lastInteractionAt: new Date(),
        jobTitle: 'CEO and Founder',
      });
      const detector = new VipDetector({ vipList: [vip], contacts: [contact] });
      const email = createTestEmail({ from: { email: 'max@example.com' } });

      const result = detector.detectVip(email);

      expect(result.score).toBeLessThanOrEqual(1.0);
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should use 0.5 threshold for isVip flag', () => {
      const contact = createTestContact({
        email: 'threshold@example.com',
        interactionCount: 25, // Medium interaction = 0.4
        lastInteractionAt: new Date(), // Recency boost = 0.2
      });
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'threshold@example.com' } });

      const result = detector.detectVip(email);

      // 0.4 + 0.2 = 0.6 >= 0.5 threshold
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.isVip).toBe(true);
    });
  });

  describe('VIP Management', () => {
    it('should add VIP to list', () => {
      const detector = new VipDetector();
      const vip = createTestVip();

      detector.addVip(vip);

      expect(detector.getVipList()).toHaveLength(1);
      expect(detector.getVipList()[0]).toEqual(vip);
    });

    it('should not add duplicate VIP', () => {
      const vip = createTestVip({ email: 'vip@example.com' });
      const detector = new VipDetector({ vipList: [vip] });

      const duplicate = createTestVip({ id: 'vip-2', email: 'vip@example.com' });
      detector.addVip(duplicate);

      expect(detector.getVipList()).toHaveLength(1);
    });

    it('should remove VIP from list', () => {
      const vip = createTestVip({ email: 'remove@example.com' });
      const detector = new VipDetector({ vipList: [vip] });

      const removed = detector.removeVip('remove@example.com');

      expect(removed).toBe(true);
      expect(detector.getVipList()).toHaveLength(0);
    });

    it('should return false when removing non-existent VIP', () => {
      const detector = new VipDetector();

      const removed = detector.removeVip('nonexistent@example.com');

      expect(removed).toBe(false);
    });

    it('should set VIP list', () => {
      const detector = new VipDetector();
      const vips = [createTestVip(), createTestVip({ id: 'vip-2', email: 'vip2@example.com' })];

      detector.setVipList(vips);

      expect(detector.getVipList()).toHaveLength(2);
    });
  });

  describe('Contact Management', () => {
    it('should add contact', () => {
      const detector = new VipDetector();
      const contact = createTestContact();

      detector.addOrUpdateContact(contact);

      expect(detector.getContacts()).toHaveLength(1);
    });

    it('should update existing contact', () => {
      const contact = createTestContact({ email: 'update@example.com', interactionCount: 10 });
      const detector = new VipDetector({ contacts: [contact] });

      const updated = createTestContact({ email: 'update@example.com', interactionCount: 20 });
      detector.addOrUpdateContact(updated);

      expect(detector.getContacts()).toHaveLength(1);
      expect(detector.getContacts()[0]?.interactionCount).toBe(20);
    });

    it('should set contacts', () => {
      const detector = new VipDetector();
      const contacts = [
        createTestContact(),
        createTestContact({ id: 'contact-2', email: 'contact2@example.com' }),
      ];

      detector.setContacts(contacts);

      expect(detector.getContacts()).toHaveLength(2);
    });
  });

  describe('Options Management', () => {
    it('should get current options', () => {
      const detector = new VipDetector();
      const options = detector.getOptions();

      expect(options.vipMatchWeight).toBe(0.8);
      expect(options.highInteractionThreshold).toBe(50);
    });

    it('should update options', () => {
      const detector = new VipDetector();

      detector.updateOptions({ vipMatchWeight: 0.9, highInteractionThreshold: 100 });

      const options = detector.getOptions();
      expect(options.vipMatchWeight).toBe(0.9);
      expect(options.highInteractionThreshold).toBe(100);
    });
  });

  describe('Batch Detection', () => {
    it('should detect VIPs for multiple emails', () => {
      const vip = createTestVip({ email: 'vip@example.com' });
      const detector = new VipDetector({ vipList: [vip] });

      const emails = [
        createTestEmail({ id: 'email-1', from: { email: 'vip@example.com' } }),
        createTestEmail({ id: 'email-2', from: { email: 'other@example.com' } }),
      ];

      const results = detector.detectVips(emails);

      expect(results.size).toBe(2);
      expect(results.get('email-1')?.isVip).toBe(true);
      expect(results.get('email-2')?.isVip).toBe(false);
    });

    it('should handle empty email list', () => {
      const detector = new VipDetector();
      const results = detector.detectVips([]);

      expect(results.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle contact with no interaction count', () => {
      const contact = createTestContact({ email: 'no-count@example.com' });
      delete contact.interactionCount;
      delete contact.lastInteractionAt; // No recency boost
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'no-count@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle contact with no last interaction date', () => {
      const contact = createTestContact({ email: 'no-date@example.com' });
      delete contact.lastInteractionAt;
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'no-date@example.com' } });

      const result = detector.detectVip(email);

      const recentBoost = result.reasons.find((r) => r.type === 'recent_interaction');
      expect(recentBoost).toBeUndefined();
    });

    it('should handle contact with no job title', () => {
      const contact = createTestContact({ email: 'no-title@example.com' });
      delete contact.jobTitle;
      const detector = new VipDetector({ contacts: [contact] });
      const email = createTestEmail({ from: { email: 'no-title@example.com' } });

      const result = detector.detectVip(email);

      const titleReason = result.reasons.find((r) => r.type === 'job_title');
      expect(titleReason).toBeUndefined();
    });

    it('should handle email with no matches', () => {
      const detector = new VipDetector();
      const email = createTestEmail({ from: { email: 'nobody@example.com' } });

      const result = detector.detectVip(email);

      expect(result.isVip).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reasons).toHaveLength(0);
      expect(result.vipEntry).toBeUndefined();
      expect(result.contact).toBeUndefined();
    });
  });
});
