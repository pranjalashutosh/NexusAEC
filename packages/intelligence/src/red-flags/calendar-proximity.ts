import type { StandardEmail, CalendarEvent } from '@nexus-aec/shared-types';

/**
 * Configuration options for calendar proximity detection
 */
export interface CalendarProximityOptions {
  /**
   * Time window for upcoming events (in days)
   * Default: 7 days
   */
  upcomingWindowDays?: number;

  /**
   * Weight for time proximity (0.0-1.0)
   * Default: 0.6
   */
  timeProximityWeight?: number;

  /**
   * Weight for content matching (0.0-1.0)
   * Default: 0.7
   */
  contentMatchWeight?: number;

  /**
   * Weight for attendee overlap (0.0-1.0)
   * Default: 0.8
   */
  attendeeOverlapWeight?: number;

  /**
   * Weight for organizer match (0.0-1.0)
   * Default: 0.9
   */
  organizerMatchWeight?: number;

  /**
   * Minimum similarity threshold for content matching (0.0-1.0)
   * Default: 0.3
   */
  contentSimilarityThreshold?: number;
}

/**
 * Result of calendar proximity analysis
 */
export interface CalendarProximityResult {
  /**
   * Whether email has proximity to upcoming events
   */
  hasProximity: boolean;

  /**
   * Proximity score (0.0-1.0)
   */
  score: number;

  /**
   * Relevant events found
   */
  relevantEvents: RelevantEvent[];

  /**
   * Reasons for proximity detection
   */
  reasons: ProximityReason[];
}

/**
 * Relevant calendar event with proximity details
 */
export interface RelevantEvent {
  /**
   * Calendar event
   */
  event: CalendarEvent;

  /**
   * Proximity score for this event (0.0-1.0)
   */
  proximityScore: number;

  /**
   * Time to event in hours (negative if in past)
   */
  timeToEventHours: number;

  /**
   * Content similarity score (0.0-1.0)
   */
  contentSimilarity: number;

  /**
   * Overlapping attendee emails
   */
  attendeeOverlap: string[];

  /**
   * Whether sender is the organizer
   */
  isOrganizerMatch: boolean;
}

/**
 * Reason for proximity detection
 */
export interface ProximityReason {
  /**
   * Type of proximity reason
   */
  type: 'time_proximity' | 'content_match' | 'attendee_overlap' | 'organizer_match';

  /**
   * Description of the reason
   */
  description: string;

  /**
   * Weight contribution (0.0-1.0)
   */
  weight: number;

  /**
   * Event ID this reason applies to
   */
  eventId: string;
}

/**
 * Normalize email address for comparison
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Calculate hours between two dates
 */
function hoursBetween(date1: Date, date2: Date): number {
  const diffMs = date2.getTime() - date1.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Extract keywords from text (lowercase, alphanumeric words >= 3 chars)
 */
function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  // Filter out common stop words
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'are',
    'but',
    'not',
    'you',
    'all',
    'can',
    'her',
    'was',
    'one',
    'our',
    'out',
    'day',
    'get',
    'has',
    'him',
    'his',
    'how',
    'its',
    'may',
    'now',
    'see',
    'than',
    'that',
    'this',
    'will',
    'with',
  ]);

  return new Set(words.filter((word) => !stopWords.has(word)));
}

/**
 * Calculate Jaccard similarity between two keyword sets
 */
function calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 0;
  }

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Calculate time-based proximity score
 * - Within 1 hour: 1.0
 * - Within 24 hours: 0.8
 * - Within 3 days: 0.6
 * - Within 7 days: 0.4
 * - Beyond 7 days: 0.0
 */
function calculateTimeProximityScore(hoursToEvent: number): number {
  const absHours = Math.abs(hoursToEvent);

  if (absHours <= 1) {
    return 1.0;
  } else if (absHours <= 24) {
    return 0.8;
  } else if (absHours <= 72) {
    return 0.6;
  } else if (absHours <= 168) {
    return 0.4;
  } else {
    return 0.0;
  }
}

/**
 * CalendarProximityDetector class for detecting email relevance to calendar events
 *
 * Provides:
 * - Time-based proximity scoring
 * - Content/keyword matching with events
 * - Attendee overlap detection
 * - Organizer matching
 *
 * @example
 * ```typescript
 * const detector = new CalendarProximityDetector({
 *   upcomingEvents: userCalendarEvents,
 * });
 *
 * const result = detector.detectProximity(email);
 * if (result.hasProximity) {
 *   console.log(`Proximity score: ${result.score}`);
 *   result.relevantEvents.forEach(event => {
 *     console.log(`- ${event.event.title} in ${event.timeToEventHours}h`);
 *   });
 * }
 * ```
 */
export class CalendarProximityDetector {
  private options: Required<CalendarProximityOptions>;
  private upcomingEvents: CalendarEvent[];

  constructor(
    config: {
      upcomingEvents?: CalendarEvent[];
    } = {},
    options: CalendarProximityOptions = {}
  ) {
    this.upcomingEvents = config.upcomingEvents ?? [];

    this.options = {
      upcomingWindowDays: options.upcomingWindowDays ?? 7,
      timeProximityWeight: options.timeProximityWeight ?? 0.6,
      contentMatchWeight: options.contentMatchWeight ?? 0.7,
      attendeeOverlapWeight: options.attendeeOverlapWeight ?? 0.8,
      organizerMatchWeight: options.organizerMatchWeight ?? 0.9,
      contentSimilarityThreshold: options.contentSimilarityThreshold ?? 0.3,
    };
  }

  /**
   * Detect calendar proximity for an email
   */
  detectProximity(email: StandardEmail, referenceTime?: Date): CalendarProximityResult {
    const now = referenceTime ?? new Date();
    const reasons: ProximityReason[] = [];
    const relevantEvents: RelevantEvent[] = [];
    let maxScore = 0;

    // Filter events within the upcoming window
    const windowMs = this.options.upcomingWindowDays * 24 * 60 * 60 * 1000;
    const windowEnd = new Date(now.getTime() + windowMs);

    const eventsInWindow = this.upcomingEvents.filter((event) => {
      // Skip cancelled events
      if (event.status === 'cancelled') {
        return false;
      }

      // Event should start within the window
      return event.startTime >= now && event.startTime <= windowEnd;
    });

    // Extract email keywords for content matching
    const emailText = `${email.subject} ${email.body ?? email.snippet ?? ''}`;
    const emailKeywords = extractKeywords(emailText);

    // Normalize sender email
    const senderEmail = normalizeEmail(email.from.email);

    // Analyze each event
    for (const event of eventsInWindow) {
      let eventScore = 0;
      const eventReasons: ProximityReason[] = [];
      const attendeeOverlap: string[] = [];
      let isOrganizerMatch = false;

      // 1. Time proximity scoring
      const hoursToEvent = hoursBetween(now, event.startTime);
      const timeScore = calculateTimeProximityScore(hoursToEvent);

      if (timeScore > 0) {
        const timeWeight = this.options.timeProximityWeight * timeScore;
        eventScore += timeWeight;
        eventReasons.push({
          type: 'time_proximity',
          description: `Event "${event.title}" in ${Math.round(hoursToEvent)} hours`,
          weight: timeWeight,
          eventId: event.id,
        });
      }

      // 2. Content matching
      const eventText = `${event.title} ${event.description ?? ''} ${event.location ?? ''}`;
      const eventKeywords = extractKeywords(eventText);
      const contentSimilarity = calculateSimilarity(emailKeywords, eventKeywords);

      if (contentSimilarity >= this.options.contentSimilarityThreshold) {
        const contentWeight = this.options.contentMatchWeight * contentSimilarity;
        eventScore += contentWeight;
        eventReasons.push({
          type: 'content_match',
          description: `Content similarity: ${Math.round(contentSimilarity * 100)}%`,
          weight: contentWeight,
          eventId: event.id,
        });
      }

      // 3. Attendee overlap
      const attendeeEmails = event.attendees.map((a) => normalizeEmail(a.email));

      // Check sender
      if (attendeeEmails.includes(senderEmail)) {
        attendeeOverlap.push(email.from.email);
        eventScore += this.options.attendeeOverlapWeight;
        eventReasons.push({
          type: 'attendee_overlap',
          description: `Sender is attendee of "${event.title}"`,
          weight: this.options.attendeeOverlapWeight,
          eventId: event.id,
        });
      }

      // Check if sender is organizer (higher weight)
      const organizerEmail = normalizeEmail(event.organizer.email);
      if (senderEmail === organizerEmail) {
        isOrganizerMatch = true;
        eventScore += this.options.organizerMatchWeight;
        eventReasons.push({
          type: 'organizer_match',
          description: `Sender is organizer of "${event.title}"`,
          weight: this.options.organizerMatchWeight,
          eventId: event.id,
        });
      }

      // Only include events with non-zero score
      if (eventScore > 0) {
        // Cap event score at 1.0
        const cappedEventScore = Math.min(eventScore, 1.0);

        relevantEvents.push({
          event,
          proximityScore: cappedEventScore,
          timeToEventHours: Math.round(hoursToEvent * 10) / 10,
          contentSimilarity: Math.round(contentSimilarity * 100) / 100,
          attendeeOverlap,
          isOrganizerMatch,
        });

        reasons.push(...eventReasons);
        maxScore = Math.max(maxScore, cappedEventScore);
      }
    }

    // Sort relevant events by proximity score (descending)
    relevantEvents.sort((a, b) => b.proximityScore - a.proximityScore);

    return {
      hasProximity: maxScore >= 0.5, // Threshold for proximity
      score: maxScore,
      relevantEvents,
      reasons,
    };
  }

  /**
   * Batch detect proximity for multiple emails
   */
  detectProximityBatch(
    emails: StandardEmail[],
    referenceTime?: Date
  ): Map<string, CalendarProximityResult> {
    const results = new Map<string, CalendarProximityResult>();

    for (const email of emails) {
      const result = this.detectProximity(email, referenceTime);
      results.set(email.id, result);
    }

    return results;
  }

  /**
   * Get upcoming events
   */
  getUpcomingEvents(): CalendarEvent[] {
    return [...this.upcomingEvents];
  }

  /**
   * Set upcoming events
   */
  setUpcomingEvents(events: CalendarEvent[]): void {
    this.upcomingEvents = events;
  }

  /**
   * Add event to upcoming events
   */
  addEvent(event: CalendarEvent): void {
    // Check if already exists
    const existing = this.upcomingEvents.find((e) => e.id === event.id);
    if (!existing) {
      this.upcomingEvents.push(event);
    }
  }

  /**
   * Remove event from upcoming events
   */
  removeEvent(eventId: string): boolean {
    const index = this.upcomingEvents.findIndex((e) => e.id === eventId);
    if (index !== -1) {
      this.upcomingEvents.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get detection options
   */
  getOptions(): Required<CalendarProximityOptions> {
    return { ...this.options };
  }

  /**
   * Update detection options
   */
  updateOptions(options: Partial<CalendarProximityOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }
}
