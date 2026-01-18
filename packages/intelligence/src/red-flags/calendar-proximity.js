"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarProximityDetector = void 0;
/**
 * Normalize email address for comparison
 */
function normalizeEmail(email) {
    return email.toLowerCase().trim();
}
/**
 * Calculate hours between two dates
 */
function hoursBetween(date1, date2) {
    var diffMs = date2.getTime() - date1.getTime();
    return diffMs / (1000 * 60 * 60);
}
/**
 * Extract keywords from text (lowercase, alphanumeric words >= 3 chars)
 */
function extractKeywords(text) {
    var words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(function (word) { return word.length >= 3; });
    // Filter out common stop words
    var stopWords = new Set([
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
    return new Set(words.filter(function (word) { return !stopWords.has(word); }));
}
/**
 * Calculate Jaccard similarity between two keyword sets
 */
function calculateSimilarity(set1, set2) {
    if (set1.size === 0 && set2.size === 0) {
        return 0;
    }
    var intersection = new Set(__spreadArray([], set1, true).filter(function (x) { return set2.has(x); }));
    var union = new Set(__spreadArray(__spreadArray([], set1, true), set2, true));
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
function calculateTimeProximityScore(hoursToEvent) {
    var absHours = Math.abs(hoursToEvent);
    if (absHours <= 1) {
        return 1.0;
    }
    else if (absHours <= 24) {
        return 0.8;
    }
    else if (absHours <= 72) {
        return 0.6;
    }
    else if (absHours <= 168) {
        return 0.4;
    }
    else {
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
var CalendarProximityDetector = /** @class */ (function () {
    function CalendarProximityDetector(config, options) {
        if (config === void 0) { config = {}; }
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d, _e, _f, _g;
        this.upcomingEvents = (_a = config.upcomingEvents) !== null && _a !== void 0 ? _a : [];
        this.options = {
            upcomingWindowDays: (_b = options.upcomingWindowDays) !== null && _b !== void 0 ? _b : 7,
            timeProximityWeight: (_c = options.timeProximityWeight) !== null && _c !== void 0 ? _c : 0.6,
            contentMatchWeight: (_d = options.contentMatchWeight) !== null && _d !== void 0 ? _d : 0.7,
            attendeeOverlapWeight: (_e = options.attendeeOverlapWeight) !== null && _e !== void 0 ? _e : 0.8,
            organizerMatchWeight: (_f = options.organizerMatchWeight) !== null && _f !== void 0 ? _f : 0.9,
            contentSimilarityThreshold: (_g = options.contentSimilarityThreshold) !== null && _g !== void 0 ? _g : 0.3,
        };
    }
    /**
     * Detect calendar proximity for an email
     */
    CalendarProximityDetector.prototype.detectProximity = function (email, referenceTime) {
        var _a, _b, _c, _d;
        var now = referenceTime !== null && referenceTime !== void 0 ? referenceTime : new Date();
        var reasons = [];
        var relevantEvents = [];
        var maxScore = 0;
        // Filter events within the upcoming window
        var windowMs = this.options.upcomingWindowDays * 24 * 60 * 60 * 1000;
        var windowEnd = new Date(now.getTime() + windowMs);
        var eventsInWindow = this.upcomingEvents.filter(function (event) {
            // Skip cancelled events
            if (event.status === 'cancelled') {
                return false;
            }
            // Event should start within the window
            return event.startTime >= now && event.startTime <= windowEnd;
        });
        // Extract email keywords for content matching
        var emailText = "".concat(email.subject, " ").concat((_b = (_a = email.body) !== null && _a !== void 0 ? _a : email.snippet) !== null && _b !== void 0 ? _b : '');
        var emailKeywords = extractKeywords(emailText);
        // Normalize sender email
        var senderEmail = normalizeEmail(email.from.email);
        // Analyze each event
        for (var _i = 0, eventsInWindow_1 = eventsInWindow; _i < eventsInWindow_1.length; _i++) {
            var event_1 = eventsInWindow_1[_i];
            var eventScore = 0;
            var eventReasons = [];
            var attendeeOverlap = [];
            var isOrganizerMatch = false;
            // 1. Time proximity scoring
            var hoursToEvent = hoursBetween(now, event_1.startTime);
            var timeScore = calculateTimeProximityScore(hoursToEvent);
            if (timeScore > 0) {
                var timeWeight = this.options.timeProximityWeight * timeScore;
                eventScore += timeWeight;
                eventReasons.push({
                    type: 'time_proximity',
                    description: "Event \"".concat(event_1.title, "\" in ").concat(Math.round(hoursToEvent), " hours"),
                    weight: timeWeight,
                    eventId: event_1.id,
                });
            }
            // 2. Content matching
            var eventText = "".concat(event_1.title, " ").concat((_c = event_1.description) !== null && _c !== void 0 ? _c : '', " ").concat((_d = event_1.location) !== null && _d !== void 0 ? _d : '');
            var eventKeywords = extractKeywords(eventText);
            var contentSimilarity = calculateSimilarity(emailKeywords, eventKeywords);
            if (contentSimilarity >= this.options.contentSimilarityThreshold) {
                var contentWeight = this.options.contentMatchWeight * contentSimilarity;
                eventScore += contentWeight;
                eventReasons.push({
                    type: 'content_match',
                    description: "Content similarity: ".concat(Math.round(contentSimilarity * 100), "%"),
                    weight: contentWeight,
                    eventId: event_1.id,
                });
            }
            // 3. Attendee overlap
            var attendeeEmails = event_1.attendees.map(function (a) { return normalizeEmail(a.email); });
            // Check sender
            if (attendeeEmails.includes(senderEmail)) {
                attendeeOverlap.push(email.from.email);
                eventScore += this.options.attendeeOverlapWeight;
                eventReasons.push({
                    type: 'attendee_overlap',
                    description: "Sender is attendee of \"".concat(event_1.title, "\""),
                    weight: this.options.attendeeOverlapWeight,
                    eventId: event_1.id,
                });
            }
            // Check if sender is organizer (higher weight)
            var organizerEmail = normalizeEmail(event_1.organizer.email);
            if (senderEmail === organizerEmail) {
                isOrganizerMatch = true;
                eventScore += this.options.organizerMatchWeight;
                eventReasons.push({
                    type: 'organizer_match',
                    description: "Sender is organizer of \"".concat(event_1.title, "\""),
                    weight: this.options.organizerMatchWeight,
                    eventId: event_1.id,
                });
            }
            // Only include events with non-zero score
            if (eventScore > 0) {
                // Cap event score at 1.0
                var cappedEventScore = Math.min(eventScore, 1.0);
                relevantEvents.push({
                    event: event_1,
                    proximityScore: cappedEventScore,
                    timeToEventHours: Math.round(hoursToEvent * 10) / 10,
                    contentSimilarity: Math.round(contentSimilarity * 100) / 100,
                    attendeeOverlap: attendeeOverlap,
                    isOrganizerMatch: isOrganizerMatch,
                });
                reasons.push.apply(reasons, eventReasons);
                maxScore = Math.max(maxScore, cappedEventScore);
            }
        }
        // Sort relevant events by proximity score (descending)
        relevantEvents.sort(function (a, b) { return b.proximityScore - a.proximityScore; });
        return {
            hasProximity: maxScore >= 0.5, // Threshold for proximity
            score: maxScore,
            relevantEvents: relevantEvents,
            reasons: reasons,
        };
    };
    /**
     * Batch detect proximity for multiple emails
     */
    CalendarProximityDetector.prototype.detectProximityBatch = function (emails, referenceTime) {
        var results = new Map();
        for (var _i = 0, emails_1 = emails; _i < emails_1.length; _i++) {
            var email = emails_1[_i];
            var result = this.detectProximity(email, referenceTime);
            results.set(email.id, result);
        }
        return results;
    };
    /**
     * Get upcoming events
     */
    CalendarProximityDetector.prototype.getUpcomingEvents = function () {
        return __spreadArray([], this.upcomingEvents, true);
    };
    /**
     * Set upcoming events
     */
    CalendarProximityDetector.prototype.setUpcomingEvents = function (events) {
        this.upcomingEvents = events;
    };
    /**
     * Add event to upcoming events
     */
    CalendarProximityDetector.prototype.addEvent = function (event) {
        // Check if already exists
        var existing = this.upcomingEvents.find(function (e) { return e.id === event.id; });
        if (!existing) {
            this.upcomingEvents.push(event);
        }
    };
    /**
     * Remove event from upcoming events
     */
    CalendarProximityDetector.prototype.removeEvent = function (eventId) {
        var index = this.upcomingEvents.findIndex(function (e) { return e.id === eventId; });
        if (index !== -1) {
            this.upcomingEvents.splice(index, 1);
            return true;
        }
        return false;
    };
    /**
     * Get detection options
     */
    CalendarProximityDetector.prototype.getOptions = function () {
        return __assign({}, this.options);
    };
    /**
     * Update detection options
     */
    CalendarProximityDetector.prototype.updateOptions = function (options) {
        this.options = __assign(__assign({}, this.options), options);
    };
    return CalendarProximityDetector;
}());
exports.CalendarProximityDetector = CalendarProximityDetector;
