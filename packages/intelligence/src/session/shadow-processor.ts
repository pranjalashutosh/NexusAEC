/**
 * Shadow Processor for Real-Time Session State Updates
 *
 * Implements the "Ack & Act" pattern for voice briefing sessions.
 * Listens to transcript events from LiveKit and updates DriveState in Redis.
 *
 * This enables:
 * - Real-time navigation (pause, skip, go back, go deeper)
 * - Interrupt handling
 * - Session recovery after network drops
 */

import {
  updateDriveState,
  navigateToNextItem,
  navigateToPreviousItem,
  skipCurrentTopic,
  goDeeper,
  InterruptStatus,
} from './drive-state';

import type { DriveState, UserAction } from './drive-state';
import type { RedisSessionStore } from './redis-session-store';

/**
 * Transcript event from LiveKit
 */
export interface TranscriptEvent {
  /**
   * Session ID (room name)
   */
  sessionId: string;

  /**
   * Participant who spoke (user or agent)
   */
  participant: 'user' | 'agent';

  /**
   * Transcribed text
   */
  text: string;

  /**
   * Timestamp of speech
   */
  timestamp: Date;

  /**
   * Whether this is a final transcript (vs interim)
   */
  isFinal: boolean;

  /**
   * Optional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Detected command intent from user speech
 */
export interface CommandIntent {
  /**
   * Command type
   */
  type:
    | 'PAUSE'
    | 'RESUME'
    | 'SKIP'
    | 'GO_BACK'
    | 'GO_DEEPER'
    | 'NEXT'
    | 'REPEAT'
    | 'STOP'
    | 'UNKNOWN';

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Original utterance
   */
  utterance: string;

  /**
   * Matched pattern (for debugging)
   */
  matchedPattern?: string;

  /**
   * Additional context extracted from utterance
   */
  context?: Record<string, unknown>;
}

/**
 * Command patterns for intent detection
 */
interface CommandPattern {
  type: CommandIntent['type'];
  patterns: RegExp[];
  confidence: number;
}

/**
 * Default command patterns
 */
const DEFAULT_COMMAND_PATTERNS: CommandPattern[] = [
  // Pause commands
  {
    type: 'PAUSE',
    patterns: [
      /\b(pause|hold\s+on|wait|stop\s+for\s+a\s+moment)\b/i,
      /\b(give\s+me\s+a\s+second|one\s+moment)\b/i,
      /\b(hang\s+on)\b/i,
    ],
    confidence: 0.9,
  },

  // Resume commands
  {
    type: 'RESUME',
    patterns: [
      /\b(resume|continue|go\s+ahead|keep\s+going)\b/i,
      /\b(carry\s+on|proceed)\b/i,
      /\b(ok(ay)?\s+(continue|go\s+ahead))\b/i,
    ],
    confidence: 0.9,
  },

  // Skip commands
  {
    type: 'SKIP',
    patterns: [
      /\b(skip(\s+this)?|next\s+topic|move\s+on)\b/i,
      /\b(skip\s+to\s+next|go\s+to\s+next)\b/i,
      /\b(don'?t\s+care\s+about\s+this)\b/i,
    ],
    confidence: 0.85,
  },

  // Go back commands
  {
    type: 'GO_BACK',
    patterns: [
      /\b(go\s+back|previous|last\s+one)\b/i,
      /\b(what\s+was\s+that)\b/i,
    ],
    confidence: 0.85,
  },

  // Go deeper commands
  {
    type: 'GO_DEEPER',
    patterns: [
      /\b(tell\s+me\s+more|more\s+details?|expand|elaborate)\b/i,
      /\b(go\s+deeper|dig\s+deeper|full\s+thread)\b/i,
      /\b(read\s+(the\s+)?(full|entire|whole)\s+(email|thread|message))\b/i,
    ],
    confidence: 0.85,
  },

  // Next commands
  {
    type: 'NEXT',
    patterns: [
      /\b(next(\s+one)?|next\s+email|next\s+item)\b/i,
      /\b(move\s+to\s+next)\b/i,
    ],
    confidence: 0.9,
  },

  // Repeat commands
  {
    type: 'REPEAT',
    patterns: [
      /\b(repeat|say\s+that\s+again|one\s+more\s+time)\b/i,
      /\b(didn'?t\s+catch\s+that|pardon)\b/i,
    ],
    confidence: 0.9,
  },

  // Stop commands
  {
    type: 'STOP',
    patterns: [
      /\b(stop|cancel|end\s+briefing|that'?s\s+all)\b/i,
      /\b(i'?m\s+done|finish)\b/i,
    ],
    confidence: 0.95,
  },
];

/**
 * Event handler for state changes
 */
export type StateChangeHandler = (
  sessionId: string,
  oldState: DriveState | null,
  newState: DriveState,
  event: TranscriptEvent
) => void | Promise<void>;

/**
 * Event handler for command detection
 */
export type CommandDetectedHandler = (
  sessionId: string,
  intent: CommandIntent,
  event: TranscriptEvent
) => void | Promise<void>;

/**
 * Event handler for errors
 */
export type ErrorHandler = (error: Error, event: TranscriptEvent) => void | Promise<void>;

/**
 * Options for ShadowProcessor
 */
export interface ShadowProcessorOptions {
  /**
   * Redis session store instance
   */
  store: RedisSessionStore;

  /**
   * Custom command patterns (extends defaults)
   */
  customPatterns?: CommandPattern[];

  /**
   * Minimum confidence threshold for command detection
   * Default: 0.7
   */
  confidenceThreshold?: number;

  /**
   * Whether to process interim transcripts
   * Default: false (only process final transcripts)
   */
  processInterim?: boolean;

  /**
   * Whether to enable debug logging
   */
  debug?: boolean;
}

/**
 * ShadowProcessor - Background service for real-time state updates
 *
 * Processes transcript events from LiveKit and updates DriveState in Redis.
 * Implements the "Ack & Act" pattern for responsive voice interactions.
 *
 * @example
 * ```typescript
 * const processor = new ShadowProcessor({
 *   store: redisSessionStore,
 *   confidenceThreshold: 0.7,
 * });
 *
 * // Listen for state changes
 * processor.on('stateChange', (sessionId, oldState, newState) => {
 *   console.log(`Session ${sessionId} updated`);
 * });
 *
 * // Process transcript event
 * const event: TranscriptEvent = {
 *   sessionId: 'session-123',
 *   participant: 'user',
 *   text: 'pause the briefing',
 *   timestamp: new Date(),
 *   isFinal: true,
 * };
 *
 * await processor.processEvent(event);
 * ```
 */
export class ShadowProcessor {
  private store: RedisSessionStore;
  private patterns: CommandPattern[];
  private confidenceThreshold: number;
  private processInterim: boolean;
  private debug: boolean;

  private stateChangeHandlers: Set<StateChangeHandler> = new Set();
  private commandDetectedHandlers: Set<CommandDetectedHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  constructor(options: ShadowProcessorOptions) {
    this.store = options.store;
    this.patterns = [...DEFAULT_COMMAND_PATTERNS, ...(options.customPatterns ?? [])];
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
    this.processInterim = options.processInterim ?? false;
    this.debug = options.debug ?? false;
  }

  /**
   * Register state change handler
   */
  on(event: 'stateChange', handler: StateChangeHandler): void;
  on(event: 'commandDetected', handler: CommandDetectedHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(
    event: 'stateChange' | 'commandDetected' | 'error',
    handler: StateChangeHandler | CommandDetectedHandler | ErrorHandler
  ): void {
    switch (event) {
      case 'stateChange':
        this.stateChangeHandlers.add(handler as StateChangeHandler);
        break;
      case 'commandDetected':
        this.commandDetectedHandlers.add(handler as CommandDetectedHandler);
        break;
      case 'error':
        this.errorHandlers.add(handler as ErrorHandler);
        break;
    }
  }

  /**
   * Unregister handler
   */
  off(event: 'stateChange', handler: StateChangeHandler): void;
  off(event: 'commandDetected', handler: CommandDetectedHandler): void;
  off(event: 'error', handler: ErrorHandler): void;
  off(
    event: 'stateChange' | 'commandDetected' | 'error',
    handler: StateChangeHandler | CommandDetectedHandler | ErrorHandler
  ): void {
    switch (event) {
      case 'stateChange':
        this.stateChangeHandlers.delete(handler as StateChangeHandler);
        break;
      case 'commandDetected':
        this.commandDetectedHandlers.delete(handler as CommandDetectedHandler);
        break;
      case 'error':
        this.errorHandlers.delete(handler as ErrorHandler);
        break;
    }
  }

  /**
   * Emit event to handlers
   */
  private async emit(
    event: 'stateChange',
    sessionId: string,
    oldState: DriveState | null,
    newState: DriveState,
    transcriptEvent: TranscriptEvent
  ): Promise<void>;
  private async emit(
    event: 'commandDetected',
    sessionId: string,
    intent: CommandIntent,
    transcriptEvent: TranscriptEvent
  ): Promise<void>;
  private async emit(event: 'error', error: Error, transcriptEvent: TranscriptEvent): Promise<void>;
  private async emit(...args: any[]): Promise<void> {
    const event = args[0] as 'stateChange' | 'commandDetected' | 'error';

    try {
      switch (event) {
        case 'stateChange': {
          const [, sessionId, oldState, newState, transcriptEvent] = args;
          for (const handler of this.stateChangeHandlers) {
            await handler(sessionId, oldState, newState, transcriptEvent);
          }
          break;
        }
        case 'commandDetected': {
          const [, sessionId, intent, transcriptEvent] = args;
          for (const handler of this.commandDetectedHandlers) {
            await handler(sessionId, intent, transcriptEvent);
          }
          break;
        }
        case 'error': {
          const [, error, transcriptEvent] = args;
          for (const handler of this.errorHandlers) {
            await handler(error, transcriptEvent);
          }
          break;
        }
      }
    } catch (error) {
      console.error('[ShadowProcessor] Error in event handler:', error);
    }
  }

  /**
   * Detect command intent from user speech
   */
  detectIntent(text: string): CommandIntent {
    const normalizedText = text.toLowerCase().trim();

    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        if (regex.test(normalizedText)) {
          return {
            type: pattern.type,
            confidence: pattern.confidence,
            utterance: text,
            matchedPattern: regex.source,
          };
        }
      }
    }

    return {
      type: 'UNKNOWN',
      confidence: 0,
      utterance: text,
    };
  }

  /**
   * Process transcript event and update state
   */
  async processEvent(event: TranscriptEvent): Promise<void> {
    try {
      // Skip interim transcripts if not configured to process them
      if (!event.isFinal && !this.processInterim) {
        return;
      }

      // Only process user speech (agent speech doesn't trigger navigation)
      if (event.participant !== 'user') {
        return;
      }

      if (this.debug) {
        console.log(`[ShadowProcessor] Processing event: ${event.text}`);
      }

      // Detect command intent
      const intent = this.detectIntent(event.text);

      // Skip if confidence is below threshold
      if (intent.confidence < this.confidenceThreshold) {
        if (this.debug) {
          console.log(
            `[ShadowProcessor] Intent confidence too low: ${intent.confidence} < ${this.confidenceThreshold}`
          );
        }
        return;
      }

      // Emit command detected event
      await this.emit('commandDetected', event.sessionId, intent, event);

      // Get current state
      const currentState = await this.store.get(event.sessionId);

      if (!currentState) {
        if (this.debug) {
          console.warn(`[ShadowProcessor] Session ${event.sessionId} not found`);
        }
        return;
      }

      // Apply command to state
      const newState = await this.applyCommand(currentState, intent, event);

      // Update state in Redis
      await this.store.update(newState);

      // Emit state change event
      await this.emit('stateChange', event.sessionId, currentState, newState, event);

      if (this.debug) {
        console.log(`[ShadowProcessor] Updated state for session ${event.sessionId}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[ShadowProcessor] Error processing event:', err);
      await this.emit('error', err, event);
      throw err;
    }
  }

  /**
   * Apply command to current state
   */
  private async applyCommand(
    state: DriveState,
    intent: CommandIntent,
    event: TranscriptEvent
  ): Promise<DriveState> {
    const action: UserAction = {
      type: this.mapIntentToAction(intent.type),
      timestamp: event.timestamp,
      utterance: intent.utterance,
      metadata: {
        confidence: intent.confidence,
        matchedPattern: intent.matchedPattern,
      },
    };

    switch (intent.type) {
      case 'PAUSE':
        return updateDriveState(state, {
          interruptStatus: InterruptStatus.PAUSED,
          lastAction: action,
        });

      case 'RESUME':
        return updateDriveState(state, {
          interruptStatus: InterruptStatus.RESUMING,
          lastAction: action,
        });

      case 'SKIP':
        return skipCurrentTopic(state);

      case 'GO_BACK':
        return navigateToPreviousItem(state);

      case 'GO_DEEPER':
        return goDeeper(state);

      case 'NEXT':
        return navigateToNextItem(state);

      case 'REPEAT':
        // Repeat doesn't change position, just sets interrupt status
        return updateDriveState(state, {
          interruptStatus: InterruptStatus.USER_INTERRUPT,
          lastAction: { ...action, type: 'REPEAT' },
        });

      case 'STOP':
        return updateDriveState(state, {
          interruptStatus: InterruptStatus.STOPPED,
          lastAction: { ...action, type: 'STOP' },
        });

      default:
        // Unknown command, just record as interrupt
        return updateDriveState(state, {
          interruptStatus: InterruptStatus.USER_INTERRUPT,
          lastAction: { ...action, type: 'INTERRUPT' },
        });
    }
  }

  /**
   * Map intent type to action type
   */
  private mapIntentToAction(intentType: CommandIntent['type']): UserAction['type'] {
    switch (intentType) {
      case 'PAUSE':
        return 'PAUSE';
      case 'RESUME':
        return 'RESUME';
      case 'SKIP':
        return 'SKIP';
      case 'GO_BACK':
        return 'GO_BACK';
      case 'GO_DEEPER':
        return 'GO_DEEPER';
      case 'NEXT':
        return 'NAVIGATION';
      case 'REPEAT':
        return 'REPEAT';
      case 'STOP':
        return 'STOP';
      default:
        return 'INTERRUPT';
    }
  }

  /**
   * Get current command patterns
   */
  getPatterns(): CommandPattern[] {
    return [...this.patterns];
  }

  /**
   * Add custom command pattern
   */
  addPattern(pattern: CommandPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove all handlers
   */
  removeAllHandlers(): void {
    this.stateChangeHandlers.clear();
    this.commandDetectedHandlers.clear();
    this.errorHandlers.clear();
  }
}
