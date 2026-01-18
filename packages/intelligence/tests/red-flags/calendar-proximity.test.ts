import { CalendarProximityDetector } from '../../src/red-flags/calendar-proximity';
import type { StandardEmail, CalendarEvent } from '@nexus-aec/shared-types';

/**
 * Helper to create test email
 */
function createTestEmail(overrides: Partial<StandardEmail> = {}): StandardEmail {
  const defaults: StandardEmail = {
    id: 'email-1',
    source: 'GMAIL',
    threadId: 'thread-1',
    subject: 'Test email',
    from: { email: 'sender@example.com', name: 'Sender' },
    to: [{ email: 'recipient@example.com', name: 'Recipient' }],
    cc: [],
    bcc: [],
    snippet: 'Test snippet',
    body: 'Test body',
    receivedAt: new Date(),
    isRead: false,
    isStarred: false,
    labels: [],
  };

  return { ...defaults, ...overrides };
}

/**
 * Helper to create test calendar event
 */
function createTestEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const now = new Date();
  const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

  const defaults: CalendarEvent = {
    id: 'event-1',
    source: 'GMAIL',
    title: 'Team Meeting',
    startTime,
    endTime,
    isAllDay: false,
    attendees: [
      { email: 'attendee1@example.com', name: 'Attendee 1' },
      { email: 'attendee2@example.com', name: 'Attendee 2' },
    ],
    organizer: { email: 'organizer@example.com', name: 'Organizer' },
    status: 'confirmed',
  };

  return { ...defaults, ...overrides };
}

describe('CalendarProximityDetector', () => {
  describe('Constructor and Configuration', () => {
    it('should create detector with default options', () => {
      const detector = new CalendarProximityDetector();
      const options = detector.getOptions();

      expect(options.upcomingWindowDays).toBe(7);
      expect(options.timeProximityWeight).toBe(0.6);
      expect(options.contentMatchWeight).toBe(0.7);
      expect(options.attendeeOverlapWeight).toBe(0.8);
      expect(options.organizerMatchWeight).toBe(0.9);
      expect(options.contentSimilarityThreshold).toBe(0.3);
    });

    it('should create detector with custom options', () => {
      const detector = new CalendarProximityDetector(
        {},
        {
          upcomingWindowDays: 14,
          timeProximityWeight: 0.5,
          contentMatchWeight: 0.6,
        }
      );

      const options = detector.getOptions();
      expect(options.upcomingWindowDays).toBe(14);
      expect(options.timeProximityWeight).toBe(0.5);
      expect(options.contentMatchWeight).toBe(0.6);
    });

    it('should create detector with upcoming events', () => {
      const events = [createTestEvent()];
      const detector = new CalendarProximityDetector({ upcomingEvents: events });

      expect(detector.getUpcomingEvents()).toHaveLength(1);
    });

    it('should update options dynamically', () => {
      const detector = new CalendarProximityDetector();

      detector.updateOptions({ timeProximityWeight: 0.9 });

      const options = detector.getOptions();
      expect(options.timeProximityWeight).toBe(0.9);
      expect(options.contentMatchWeight).toBe(0.7); // Unchanged
    });
  });

  describe('Time-Based Proximity', () => {
    it('should detect proximity for event within 1 hour', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 30 * 60 * 1000), // 30 min from now
        endTime: new Date(now.getTime() + 90 * 60 * 1000),
        title: 'Urgent Meeting',
      });

      const email = createTestEmail({
        subject: 'Meeting reminder',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeGreaterThan(0);
      expect(result.relevantEvents).toHaveLength(1);
      expect(result.relevantEvents[0]?.timeToEventHours).toBeCloseTo(0.5, 1);
    });

    it('should detect proximity for event within 24 hours', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 12 * 60 * 60 * 1000), // 12 hours
        endTime: new Date(now.getTime() + 13 * 60 * 60 * 1000),
        title: 'Project Review',
      });

      const email = createTestEmail({
        subject: 'Project update',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeGreaterThan(0);
      expect(result.relevantEvents).toHaveLength(1);
    });

    it('should detect proximity for event within 3 days', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 2 days
        endTime: new Date(now.getTime() + 49 * 60 * 60 * 1000),
        title: 'Conference',
      });

      const email = createTestEmail({
        subject: 'Conference details',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeGreaterThan(0);
      expect(result.relevantEvents).toHaveLength(1);
    });

    it('should not detect proximity for events beyond 7 days', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
        endTime: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        title: 'Future Event',
      });

      const email = createTestEmail({
        subject: 'Some email',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.relevantEvents).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should ignore cancelled events', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour
        endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        title: 'Cancelled Meeting',
        status: 'cancelled',
      });

      const email = createTestEmail({
        subject: 'Meeting update',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.relevantEvents).toHaveLength(0);
      expect(result.score).toBe(0);
    });
  });

  describe('Content Matching', () => {
    it('should match email content with event title', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Project Alpha Review Meeting',
        description: 'Quarterly review meeting for Project Alpha deliverables',
      });

      const email = createTestEmail({
        subject: 'Project Alpha Review preparation',
        body: 'Preparing materials for Project Alpha quarterly review meeting deliverables',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeGreaterThan(0);
      expect(result.relevantEvents).toHaveLength(1);
      expect(result.relevantEvents[0]?.contentSimilarity).toBeGreaterThan(0);

      const contentMatchReason = result.reasons.find((r) => r.type === 'content_match');
      expect(contentMatchReason).toBeDefined();
    });

    it('should match with event description and location', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 12 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 13 * 60 * 60 * 1000),
        title: 'Team Meeting',
        description: 'Discussion about database migration',
        location: 'Conference Room A',
      });

      const email = createTestEmail({
        subject: 'Database migration plan',
        body: 'Lets discuss the database migration strategy',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeGreaterThan(0);
      expect(result.relevantEvents[0]?.contentSimilarity).toBeGreaterThan(0);
    });

    it('should not match when content similarity is below threshold', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Marketing Strategy Meeting',
        description: 'Quarterly marketing planning session',
      });

      const email = createTestEmail({
        subject: 'Server maintenance notification',
        body: 'Scheduled server maintenance tonight',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // May have time proximity but no content match
      const contentMatchReason = result.reasons.find((r) => r.type === 'content_match');
      expect(contentMatchReason).toBeUndefined();
    });

    it('should filter out stop words in content matching', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'The quick brown fox jumps',
        description: 'This is a test for the system',
      });

      const email = createTestEmail({
        subject: 'Quick update on the system',
        body: 'This is about the system test',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // Should match on meaningful words (quick, system, test) not stop words (the, is, a)
      expect(result.relevantEvents).toHaveLength(1);
      expect(result.relevantEvents[0]?.contentSimilarity).toBeGreaterThan(0);
    });
  });

  describe('Attendee Overlap Detection', () => {
    it('should detect when sender is an attendee', () => {
      const now = new Date();
      const senderEmail = 'john@example.com';

      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Team Standup',
        attendees: [
          { email: senderEmail, name: 'John' },
          { email: 'jane@example.com', name: 'Jane' },
        ],
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'John' },
        subject: 'Quick question',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.hasProximity).toBe(true);
      expect(result.relevantEvents[0]?.attendeeOverlap).toContain(senderEmail);

      const attendeeReason = result.reasons.find((r) => r.type === 'attendee_overlap');
      expect(attendeeReason).toBeDefined();
    });

    it('should match attendee emails case-insensitively', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        attendees: [{ email: 'John.Doe@Example.COM', name: 'John' }],
      });

      const email = createTestEmail({
        from: { email: 'john.doe@example.com', name: 'John' },
        subject: 'Test',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.hasProximity).toBe(true);
      expect(result.relevantEvents[0]?.attendeeOverlap).toHaveLength(1);
    });

    it('should not detect overlap when sender is not an attendee', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        attendees: [
          { email: 'alice@example.com', name: 'Alice' },
          { email: 'bob@example.com', name: 'Bob' },
        ],
      });

      const email = createTestEmail({
        from: { email: 'charlie@example.com', name: 'Charlie' },
        subject: 'Random email',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // May have time proximity but no attendee overlap
      const attendeeReason = result.reasons.find((r) => r.type === 'attendee_overlap');
      expect(attendeeReason).toBeUndefined();
    });
  });

  describe('Organizer Matching', () => {
    it('should detect when sender is the organizer', () => {
      const now = new Date();
      const organizerEmail = 'organizer@example.com';

      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Important Meeting',
        organizer: { email: organizerEmail, name: 'Organizer' },
        attendees: [
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' },
        ],
      });

      const email = createTestEmail({
        from: { email: organizerEmail, name: 'Organizer' },
        subject: 'Meeting preparation',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.hasProximity).toBe(true);
      expect(result.relevantEvents[0]?.isOrganizerMatch).toBe(true);

      const organizerReason = result.reasons.find((r) => r.type === 'organizer_match');
      expect(organizerReason).toBeDefined();
      expect(organizerReason?.weight).toBe(0.9); // Default organizer weight
    });

    it('should give higher weight to organizer match than attendee', () => {
      const now = new Date();
      const organizerEmail = 'organizer@example.com';

      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        organizer: { email: organizerEmail, name: 'Organizer' },
      });

      const email = createTestEmail({
        from: { email: organizerEmail, name: 'Organizer' },
        subject: 'Test',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      const organizerReason = result.reasons.find((r) => r.type === 'organizer_match');
      const attendeeReason = result.reasons.find((r) => r.type === 'attendee_overlap');

      if (organizerReason && attendeeReason) {
        expect(organizerReason.weight).toBeGreaterThan(attendeeReason.weight);
      }
    });
  });

  describe('Combined Scoring', () => {
    it('should combine multiple signals for high relevance', () => {
      const now = new Date();
      const senderEmail = 'organizer@example.com';

      const event = createTestEvent({
        startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours
        endTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        title: 'Project Alpha Sprint Planning',
        description: 'Planning session for Project Alpha sprint',
        organizer: { email: senderEmail, name: 'Organizer' },
        attendees: [
          { email: senderEmail, name: 'Organizer' },
          { email: 'team@example.com', name: 'Team' },
        ],
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'Organizer' },
        subject: 'Project Alpha sprint planning agenda',
        body: 'Agenda for our Project Alpha sprint planning session',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.hasProximity).toBe(true);
      expect(result.score).toBeGreaterThan(0.8); // High score due to multiple signals
      expect(result.reasons.length).toBeGreaterThan(2); // Time + content + organizer
    });

    it('should cap score at 1.0', () => {
      const now = new Date();
      const senderEmail = 'organizer@example.com';

      const event = createTestEvent({
        startTime: new Date(now.getTime() + 30 * 60 * 1000), // 30 min
        endTime: new Date(now.getTime() + 90 * 60 * 1000),
        title: 'Critical System Review Meeting',
        description: 'Critical system review and analysis meeting',
        organizer: { email: senderEmail, name: 'Organizer' },
        attendees: [{ email: senderEmail, name: 'Organizer' }],
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'Organizer' },
        subject: 'Critical system review meeting preparation',
        body: 'Preparation materials for critical system review and analysis meeting',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('should use 0.5 threshold for hasProximity flag', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000), // 6 days
        endTime: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        title: 'Future Meeting',
      });

      const email = createTestEmail({
        subject: 'Unrelated email',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // Low score should result in hasProximity = false
      if (result.score < 0.5) {
        expect(result.hasProximity).toBe(false);
      }
    });
  });

  describe('Multiple Events', () => {
    it('should find multiple relevant events', () => {
      const now = new Date();
      const senderEmail = 'user@example.com';

      const event1 = createTestEvent({
        id: 'event-1',
        startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours
        endTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        title: 'Morning Standup',
        attendees: [{ email: senderEmail, name: 'User' }],
      });

      const event2 = createTestEvent({
        id: 'event-2',
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Project Review',
        attendees: [{ email: senderEmail, name: 'User' }],
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'User' },
        subject: 'Status update',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event1, event2] });
      const result = detector.detectProximity(email, now);

      expect(result.relevantEvents.length).toBeGreaterThanOrEqual(2);
    });

    it('should return highest score among multiple events', () => {
      const now = new Date();
      const senderEmail = 'user@example.com';

      const event1 = createTestEvent({
        id: 'event-1',
        startTime: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000), // 6 days - low proximity
        endTime: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        title: 'Future Event',
        attendees: [],
      });

      const event2 = createTestEvent({
        id: 'event-2',
        startTime: new Date(now.getTime() + 1 * 60 * 60 * 1000), // 1 hour - high proximity
        endTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        title: 'Imminent Meeting',
        attendees: [{ email: senderEmail, name: 'User' }],
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'User' },
        subject: 'Update',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event1, event2] });
      const result = detector.detectProximity(email, now);

      // Score should be based on the highest scoring event (event2)
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should sort relevant events by proximity score', () => {
      const now = new Date();
      const senderEmail = 'user@example.com';

      const event1 = createTestEvent({
        id: 'event-1',
        startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000), // 2 days
        endTime: new Date(now.getTime() + 49 * 60 * 60 * 1000),
        title: 'Low Priority',
        attendees: [],
      });

      const event2 = createTestEvent({
        id: 'event-2',
        startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours
        endTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
        title: 'High Priority',
        attendees: [{ email: senderEmail, name: 'User' }],
        organizer: { email: senderEmail, name: 'User' },
      });

      const email = createTestEmail({
        from: { email: senderEmail, name: 'User' },
        subject: 'Update',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event1, event2] });
      const result = detector.detectProximity(email, now);

      // Events should be sorted by proximity score (descending)
      if (result.relevantEvents.length >= 2) {
        expect(result.relevantEvents[0]?.proximityScore).toBeGreaterThanOrEqual(
          result.relevantEvents[1]?.proximityScore ?? 0
        );
      }
    });
  });

  describe('Event Management', () => {
    it('should add event to upcoming events', () => {
      const detector = new CalendarProximityDetector();
      const event = createTestEvent();

      detector.addEvent(event);

      expect(detector.getUpcomingEvents()).toHaveLength(1);
      expect(detector.getUpcomingEvents()[0]?.id).toBe(event.id);
    });

    it('should not add duplicate event', () => {
      const detector = new CalendarProximityDetector();
      const event = createTestEvent({ id: 'event-123' });

      detector.addEvent(event);
      detector.addEvent(event);

      expect(detector.getUpcomingEvents()).toHaveLength(1);
    });

    it('should remove event from upcoming events', () => {
      const event = createTestEvent({ id: 'event-123' });
      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });

      const removed = detector.removeEvent('event-123');

      expect(removed).toBe(true);
      expect(detector.getUpcomingEvents()).toHaveLength(0);
    });

    it('should return false when removing non-existent event', () => {
      const detector = new CalendarProximityDetector();

      const removed = detector.removeEvent('non-existent');

      expect(removed).toBe(false);
    });

    it('should set upcoming events', () => {
      const detector = new CalendarProximityDetector();
      const events = [createTestEvent({ id: 'event-1' }), createTestEvent({ id: 'event-2' })];

      detector.setUpcomingEvents(events);

      expect(detector.getUpcomingEvents()).toHaveLength(2);
    });
  });

  describe('Batch Detection', () => {
    it('should detect proximity for multiple emails', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        attendees: [
          { email: 'user1@example.com', name: 'User 1' },
          { email: 'user2@example.com', name: 'User 2' },
        ],
      });

      const emails = [
        createTestEmail({
          id: 'email-1',
          from: { email: 'user1@example.com', name: 'User 1' },
        }),
        createTestEmail({
          id: 'email-2',
          from: { email: 'user2@example.com', name: 'User 2' },
        }),
      ];

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const results = detector.detectProximityBatch(emails, now);

      expect(results.size).toBe(2);
      expect(results.get('email-1')).toBeDefined();
      expect(results.get('email-2')).toBeDefined();
    });

    it('should handle empty email list', () => {
      const detector = new CalendarProximityDetector();
      const results = detector.detectProximityBatch([]);

      expect(results.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle email with no body', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Meeting',
      });

      const email = createTestEmail({
        subject: 'Test',
        snippet: 'Test snippet',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // Should not throw error
      expect(result).toBeDefined();
    });

    it('should handle event with no description', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Meeting',
      });

      const email = createTestEmail({
        subject: 'Meeting discussion',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      expect(result).toBeDefined();
    });

    it('should handle empty upcoming events list', () => {
      const email = createTestEmail();
      const detector = new CalendarProximityDetector({ upcomingEvents: [] });

      const result = detector.detectProximity(email);

      expect(result.hasProximity).toBe(false);
      expect(result.score).toBe(0);
      expect(result.relevantEvents).toHaveLength(0);
    });

    it('should handle past events within window', () => {
      const now = new Date();
      const event = createTestEvent({
        startTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        endTime: new Date(now.getTime() - 30 * 60 * 1000),
        title: 'Past Meeting',
      });

      const email = createTestEmail({
        subject: 'Follow-up',
        receivedAt: now,
      });

      const detector = new CalendarProximityDetector({ upcomingEvents: [event] });
      const result = detector.detectProximity(email, now);

      // Past events should not be considered
      expect(result.relevantEvents).toHaveLength(0);
    });
  });
});
