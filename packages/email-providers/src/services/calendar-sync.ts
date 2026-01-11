/**
 * @nexus-aec/email-providers - Calendar Sync Service
 *
 * Aggregates calendar events from multiple providers and provides
 * unified access for the briefing system's calendar proximity scoring.
 */

import type { EmailProvider } from '../interfaces/email-provider';
import { parseStandardId } from '../interfaces/email-provider';
import type {
  EmailSource,
  CalendarEvent,
  CalendarQueryFilters,
} from '../interfaces/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Calendar sync configuration
 */
export interface CalendarSyncConfig {
  /** How far back to look for events (ms) */
  lookbackMs?: number;
  /** How far ahead to look for events (ms) */
  lookaheadMs?: number;
  /** Cache TTL for events (ms) */
  cacheTtlMs?: number;
  /** Default page size */
  defaultPageSize?: number;
  /** Continue on provider error */
  continueOnError?: boolean;
}

/**
 * Upcoming events window
 */
export interface UpcomingEventsWindow {
  /** Window start time */
  startTime: Date;
  /** Window end time */
  endTime: Date;
  /** Events in this window */
  events: CalendarEvent[];
}

/**
 * Event proximity to current time
 */
export interface EventProximity {
  /** The calendar event */
  event: CalendarEvent;
  /** Minutes until event starts (negative if already started) */
  minutesUntilStart: number;
  /** Minutes until event ends */
  minutesUntilEnd: number;
  /** Whether the event is currently happening */
  isOngoing: boolean;
  /** Whether this is the next upcoming event */
  isNext: boolean;
}

/**
 * Calendar day summary
 */
export interface CalendarDaySummary {
  /** Date (YYYY-MM-DD) */
  date: string;
  /** Events on this day */
  events: CalendarEvent[];
  /** Total number of events */
  eventCount: number;
  /** Total scheduled time in minutes */
  totalScheduledMinutes: number;
  /** Whether there are conflicts (overlapping events) */
  hasConflicts: boolean;
}

// =============================================================================
// Calendar Sync Service
// =============================================================================

/**
 * CalendarSyncService - Unified calendar access across providers
 *
 * @example
 * ```typescript
 * const calendarSync = new CalendarSyncService([outlookAdapter, gmailAdapter]);
 *
 * // Get upcoming events for the next 24 hours
 * const upcoming = await calendarSync.getUpcomingEvents(24 * 60);
 *
 * // Find next meeting
 * const nextMeeting = await calendarSync.getNextEvent();
 *
 * // Check events related to a person
 * const withBob = await calendarSync.findEventsByParticipant('bob@example.com');
 * ```
 */
export class CalendarSyncService {
  private readonly providers: Map<EmailSource, EmailProvider>;
  private readonly config: Required<CalendarSyncConfig>;

  /** In-memory event cache */
  private eventCache: Map<string, { event: CalendarEvent; cachedAt: number }> = new Map();
  private cacheLastUpdated = 0;

  constructor(
    providers: EmailProvider[],
    config: CalendarSyncConfig = {}
  ) {
    this.providers = new Map();
    for (const provider of providers) {
      this.providers.set(provider.source, provider);
    }

    this.config = {
      lookbackMs: config.lookbackMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      lookaheadMs: config.lookaheadMs ?? 14 * 24 * 60 * 60 * 1000, // 14 days
      cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000, // 5 minutes
      defaultPageSize: config.defaultPageSize ?? 50,
      continueOnError: config.continueOnError ?? true,
    };
  }

  // ===========================================================================
  // Event Fetching
  // ===========================================================================

  /**
   * Fetch all calendar events within a time range from all providers
   */
  async fetchEvents(
    filters?: CalendarQueryFilters,
    _options?: { forceRefresh?: boolean }
  ): Promise<{
    events: CalendarEvent[];
    errors: Array<{ source: EmailSource; error: string }>;
  }> {
    const now = new Date();
    const timeMin = filters?.timeMin ?? new Date(now.getTime() - this.config.lookbackMs);
    const timeMax = filters?.timeMax ?? new Date(now.getTime() + this.config.lookaheadMs);

    const events: CalendarEvent[] = [];
    const errors: Array<{ source: EmailSource; error: string }> = [];

    await Promise.all(
      Array.from(this.providers.entries()).map(async ([source, provider]) => {
        try {
          const response = await provider.fetchCalendarEvents(
            { ...filters, timeMin, timeMax },
            { pageSize: this.config.defaultPageSize }
          );

          // Cache events
          for (const event of response.items) {
            this.eventCache.set(event.id, {
              event,
              cachedAt: Date.now(),
            });
          }

          events.push(...response.items);
        } catch (error) {
          if (!this.config.continueOnError) throw error;
          errors.push({ source, error: this.getErrorMessage(error) });
        }
      })
    );

    this.cacheLastUpdated = Date.now();

    // Sort by start time
    events.sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    return { events, errors };
  }

  /**
   * Fetch a single event by ID
   */
  async fetchEvent(eventId: string): Promise<CalendarEvent | null> {
    // Check cache first
    const cached = this.eventCache.get(eventId);
    if (cached && Date.now() - cached.cachedAt < this.config.cacheTtlMs) {
      return cached.event;
    }

    // Fetch from provider
    const provider = this.getProviderForId(eventId);
    if (!provider) return null;

    const event = await provider.fetchCalendarEvent(eventId);
    if (event) {
      this.eventCache.set(eventId, { event, cachedAt: Date.now() });
    }

    return event;
  }

  // ===========================================================================
  // Event Queries
  // ===========================================================================

  /**
   * Get upcoming events within the next N minutes
   */
  async getUpcomingEvents(minutesAhead: number = 60): Promise<UpcomingEventsWindow> {
    const now = new Date();
    const endTime = new Date(now.getTime() + minutesAhead * 60 * 1000);

    const { events } = await this.fetchEvents({
      timeMin: now,
      timeMax: endTime,
    });

    return {
      startTime: now,
      endTime,
      events,
    };
  }

  /**
   * Get the next upcoming event
   */
  async getNextEvent(): Promise<CalendarEvent | null> {
    const { events } = await this.getUpcomingEvents(24 * 60); // Look 24 hours ahead

    const now = new Date();
    return events.find((e) => new Date(e.startTime) > now) ?? null;
  }

  /**
   * Get currently ongoing events
   */
  async getOngoingEvents(): Promise<CalendarEvent[]> {
    const now = new Date();

    // Fetch events that could be ongoing (started in last 8 hours, end in future)
    const { events } = await this.fetchEvents({
      timeMin: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      timeMax: new Date(now.getTime() + 60 * 60 * 1000),
    });

    return events.filter((e) => {
      const start = new Date(e.startTime);
      const end = new Date(e.endTime);
      return start <= now && end > now;
    });
  }

  /**
   * Get event proximity information
   */
  async getEventProximity(minutesAhead: number = 120): Promise<EventProximity[]> {
    const now = new Date();
    const { events } = await this.getUpcomingEvents(minutesAhead);

    const proximities: EventProximity[] = [];
    let foundNext = false;

    for (const event of events) {
      const start = new Date(event.startTime);
      const end = new Date(event.endTime);

      const minutesUntilStart = (start.getTime() - now.getTime()) / (60 * 1000);
      const minutesUntilEnd = (end.getTime() - now.getTime()) / (60 * 1000);
      const isOngoing = start <= now && end > now;
      const isNext = !foundNext && start > now;

      if (isNext) foundNext = true;

      proximities.push({
        event,
        minutesUntilStart: Math.round(minutesUntilStart),
        minutesUntilEnd: Math.round(minutesUntilEnd),
        isOngoing,
        isNext,
      });
    }

    return proximities;
  }

  /**
   * Get events for a specific day
   */
  async getEventsForDay(date: Date): Promise<CalendarDaySummary> {
    // Start and end of the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const { events } = await this.fetchEvents({
      timeMin: startOfDay,
      timeMax: endOfDay,
    });

    // Calculate total scheduled time
    let totalScheduledMinutes = 0;
    for (const event of events) {
      if (!event.isAllDay) {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        totalScheduledMinutes += (end.getTime() - start.getTime()) / (60 * 1000);
      }
    }

    // Check for conflicts (overlapping events)
    const hasConflicts = this.detectConflicts(events);

    return {
      date: startOfDay.toISOString().split('T')[0]!,
      events,
      eventCount: events.length,
      totalScheduledMinutes: Math.round(totalScheduledMinutes),
      hasConflicts,
    };
  }

  /**
   * Get events for a date range (multiple days)
   */
  async getEventsForDateRange(startDate: Date, endDate: Date): Promise<CalendarDaySummary[]> {
    const { events } = await this.fetchEvents({
      timeMin: startDate,
      timeMax: endDate,
    });

    // Group events by day
    const eventsByDay = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      const date = new Date(event.startTime).toISOString().split('T')[0]!;
      if (!eventsByDay.has(date)) {
        eventsByDay.set(date, []);
      }
      eventsByDay.get(date)!.push(event);
    }

    // Build summaries for each day
    const summaries: CalendarDaySummary[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0]!;
      const dayEvents = eventsByDay.get(dateStr) ?? [];

      let totalScheduledMinutes = 0;
      for (const event of dayEvents) {
        if (!event.isAllDay) {
          const start = new Date(event.startTime);
          const end = new Date(event.endTime);
          totalScheduledMinutes += (end.getTime() - start.getTime()) / (60 * 1000);
        }
      }

      summaries.push({
        date: dateStr,
        events: dayEvents,
        eventCount: dayEvents.length,
        totalScheduledMinutes: Math.round(totalScheduledMinutes),
        hasConflicts: this.detectConflicts(dayEvents),
      });

      current.setDate(current.getDate() + 1);
    }

    return summaries;
  }

  // ===========================================================================
  // Participant-based Queries
  // ===========================================================================

  /**
   * Find events involving a specific participant
   */
  async findEventsByParticipant(email: string): Promise<CalendarEvent[]> {
    const { events } = await this.fetchEvents();

    const emailLower = email.toLowerCase();

    return events.filter((e) => {
      // Check organizer
      if (e.organizer.email.toLowerCase() === emailLower) return true;

      // Check attendees
      return e.attendees.some((a) => a.email.toLowerCase() === emailLower);
    });
  }

  /**
   * Find events with a specific title/keyword
   */
  async findEventsByKeyword(keyword: string): Promise<CalendarEvent[]> {
    const { events } = await this.fetchEvents();

    const keywordLower = keyword.toLowerCase();

    return events.filter((e) => {
      return (
        e.title.toLowerCase().includes(keywordLower) ||
        e.description?.toLowerCase().includes(keywordLower) ||
        e.location?.toLowerCase().includes(keywordLower)
      );
    });
  }

  /**
   * Get events with online meeting links
   */
  async getOnlineMeetings(): Promise<CalendarEvent[]> {
    const { events } = await this.getUpcomingEvents(24 * 60);
    return events.filter((e) => !!e.onlineMeetingUrl);
  }

  // ===========================================================================
  // Calendar Stats
  // ===========================================================================

  /**
   * Get calendar statistics for the week
   */
  async getWeekStats(): Promise<{
    totalEvents: number;
    totalMeetingHours: number;
    busiestDay: { date: string; eventCount: number };
    freeSlots: Array<{ date: string; freeHours: number }>;
  }> {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const daySummaries = await this.getEventsForDateRange(startOfWeek, endOfWeek);

    let totalEvents = 0;
    let totalMeetingMinutes = 0;
    let busiestDay = { date: '', eventCount: 0 };
    const freeSlots: Array<{ date: string; freeHours: number }> = [];

    for (const day of daySummaries) {
      totalEvents += day.eventCount;
      totalMeetingMinutes += day.totalScheduledMinutes;

      if (day.eventCount > busiestDay.eventCount) {
        busiestDay = { date: day.date, eventCount: day.eventCount };
      }

      // Assume 8 work hours per day
      const workHours = 8;
      const busyHours = day.totalScheduledMinutes / 60;
      const freeHours = Math.max(0, workHours - busyHours);

      freeSlots.push({ date: day.date, freeHours: Math.round(freeHours * 10) / 10 });
    }

    return {
      totalEvents,
      totalMeetingHours: Math.round((totalMeetingMinutes / 60) * 10) / 10,
      busiestDay,
      freeSlots,
    };
  }

  // ===========================================================================
  // Cache Management
  // ===========================================================================

  /**
   * Clear the event cache
   */
  clearCache(): void {
    this.eventCache.clear();
    this.cacheLastUpdated = 0;
  }

  /**
   * Check if cache needs refresh
   */
  isCacheStale(): boolean {
    return Date.now() - this.cacheLastUpdated > this.config.cacheTtlMs;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Detect overlapping events (conflicts)
   */
  private detectConflicts(events: CalendarEvent[]): boolean {
    // Only check non-all-day events
    const timedEvents = events.filter((e) => !e.isAllDay);

    for (let i = 0; i < timedEvents.length; i++) {
      for (let j = i + 1; j < timedEvents.length; j++) {
        const a = timedEvents[i]!;
        const b = timedEvents[j]!;

        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();

        // Check for overlap
        if (aStart < bEnd && bStart < aEnd) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get provider for a standard ID
   */
  private getProviderForId(id: string): EmailProvider | undefined {
    const parsed = parseStandardId(id);
    if (!parsed) return undefined;
    return this.providers.get(parsed.source);
  }

  /**
   * Get error message from unknown error
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

