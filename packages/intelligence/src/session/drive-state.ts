/**
 * Drive State Types for LiveKit Voice Briefing Sessions
 *
 * Manages ephemeral session state stored in Redis (Tier 2).
 * Enables real-time "Ack & Act" pattern for voice interruptions,
 * navigation commands, and briefing position tracking.
 *
 * Session data has a 24-hour TTL and is cleared after briefing completion.
 */

/**
 * Interrupt status tracking
 */
export enum InterruptStatus {
  /** No active interruption, briefing proceeding normally */
  NONE = 'NONE',

  /** User interrupted with a question or command */
  USER_INTERRUPT = 'USER_INTERRUPT',

  /** Processing user's interruption */
  PROCESSING = 'PROCESSING',

  /** Paused by user command ("pause", "hold on") */
  PAUSED = 'PAUSED',

  /** Resuming after pause or interruption */
  RESUMING = 'RESUMING',

  /** User requested to skip current item */
  SKIPPING = 'SKIPPING',

  /** User requested to go back to previous item */
  GOING_BACK = 'GOING_BACK',

  /** User requested to go deeper into current item */
  GOING_DEEPER = 'GOING_DEEPER',

  /** Briefing stopped by user */
  STOPPED = 'STOPPED',
}

/**
 * Navigation context for current position in briefing
 */
export interface BriefingPosition {
  /**
   * Index of current topic cluster (0-based)
   */
  topicIndex: number;

  /**
   * Index of current item within topic (0-based)
   */
  itemIndex: number;

  /**
   * Total number of topics in briefing
   */
  totalTopics: number;

  /**
   * Total items in current topic
   */
  totalItemsInTopic: number;

  /**
   * Total items remaining across all topics
   */
  itemsRemaining: number;

  /**
   * Current topic/cluster ID being discussed
   */
  currentTopicId?: string;

  /**
   * Current email ID being discussed
   */
  currentEmailId?: string;

  /**
   * Depth level (0 = summary, 1 = details, 2 = full thread)
   */
  depth: number;
}

/**
 * User action/command that triggered state update
 */
export interface UserAction {
  /**
   * Action type
   */
  type:
    | 'START_BRIEFING'
    | 'PAUSE'
    | 'RESUME'
    | 'SKIP'
    | 'GO_BACK'
    | 'GO_DEEPER'
    | 'NEXT_TOPIC'
    | 'REPEAT'
    | 'INTERRUPT'
    | 'STOP'
    | 'EMAIL_ACTION'
    | 'NAVIGATION';

  /**
   * Timestamp of action
   */
  timestamp: Date;

  /**
   * User's utterance that triggered the action
   */
  utterance?: string;

  /**
   * Specific target for action (e.g., email ID for email actions)
   */
  target?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Core session state stored in Redis
 *
 * This represents the live "Drive State" of a voice briefing session.
 * Updated in real-time by the ShadowProcessor as transcript events arrive.
 */
export interface DriveState {
  /**
   * Unique session identifier (matches LiveKit room name)
   */
  sessionId: string;

  /**
   * User ID for multi-user support
   */
  userId: string;

  /**
   * Current position in briefing
   */
  position: BriefingPosition;

  /**
   * Current interrupt status
   */
  interruptStatus: InterruptStatus;

  /**
   * Timestamp when session was created
   */
  startedAt: Date;

  /**
   * Timestamp of last state update
   */
  updatedAt: Date;

  /**
   * Last user action that updated state
   */
  lastAction?: UserAction;

  /**
   * Briefing content snapshot (IDs only, full data fetched on-demand)
   */
  briefingSnapshot: {
    /**
     * Topic cluster IDs in briefing order
     */
    topicIds: string[];

    /**
     * Map of topic ID to email IDs in that topic
     */
    topicEmailMap: Record<string, string[]>;

    /**
     * Total email count
     */
    totalEmails: number;

    /**
     * Timestamp when briefing was generated
     */
    generatedAt: Date;
  };

  /**
   * Session metadata
   */
  metadata: {
    /**
     * LiveKit room name
     */
    roomName: string;

    /**
     * Email sources active in this session
     */
    sources: ('OUTLOOK' | 'GMAIL')[];

    /**
     * User preferences snapshot (VIPs, keywords, etc.)
     */
    preferencesVersion?: string;

    /**
     * Client type (mobile, desktop)
     */
    clientType?: 'mobile' | 'desktop';

    /**
     * Client version
     */
    clientVersion?: string;
  };

  /**
   * TTL (time-to-live) in seconds
   * Default: 86400 (24 hours)
   */
  ttl: number;
}

/**
 * Options for creating a new drive state
 */
export interface CreateDriveStateOptions {
  sessionId: string;
  userId: string;
  roomName: string;
  topicIds: string[];
  topicEmailMap: Record<string, string[]>;
  sources: ('OUTLOOK' | 'GMAIL')[];
  preferencesVersion?: string;
  clientType?: 'mobile' | 'desktop';
  clientVersion?: string;
  ttl?: number;
}

/**
 * Options for updating drive state
 */
export interface UpdateDriveStateOptions {
  position?: Partial<BriefingPosition>;
  interruptStatus?: InterruptStatus;
  lastAction?: UserAction;
}

/**
 * Create initial drive state for a new session
 */
export function createInitialDriveState(options: CreateDriveStateOptions): DriveState {
  const now = new Date();
  const totalEmails = Object.values(options.topicEmailMap).reduce(
    (sum, emails) => sum + emails.length,
    0
  );

  const firstTopicId = options.topicIds[0];
  const firstTopicEmails = firstTopicId ? options.topicEmailMap[firstTopicId] ?? [] : [];

  return {
    sessionId: options.sessionId,
    userId: options.userId,
    position: {
      topicIndex: 0,
      itemIndex: 0,
      totalTopics: options.topicIds.length,
      totalItemsInTopic: firstTopicEmails.length,
      itemsRemaining: totalEmails,
      currentTopicId: firstTopicId,
      currentEmailId: firstTopicEmails[0],
      depth: 0,
    },
    interruptStatus: InterruptStatus.NONE,
    startedAt: now,
    updatedAt: now,
    briefingSnapshot: {
      topicIds: options.topicIds,
      topicEmailMap: options.topicEmailMap,
      totalEmails,
      generatedAt: now,
    },
    metadata: {
      roomName: options.roomName,
      sources: options.sources,
      preferencesVersion: options.preferencesVersion,
      clientType: options.clientType,
      clientVersion: options.clientVersion,
    },
    ttl: options.ttl ?? 86400, // 24 hours default
  };
}

/**
 * Update drive state with new values
 */
export function updateDriveState(
  state: DriveState,
  updates: UpdateDriveStateOptions
): DriveState {
  const updatedState: DriveState = {
    ...state,
    updatedAt: new Date(),
  };

  if (updates.position) {
    updatedState.position = {
      ...state.position,
      ...updates.position,
    };
  }

  if (updates.interruptStatus !== undefined) {
    updatedState.interruptStatus = updates.interruptStatus;
  }

  if (updates.lastAction) {
    updatedState.lastAction = updates.lastAction;
  }

  return updatedState;
}

/**
 * Navigate to next item in briefing
 */
export function navigateToNextItem(state: DriveState): DriveState {
  const { position, briefingSnapshot } = state;
  const currentTopic = briefingSnapshot.topicIds[position.topicIndex];

  if (!currentTopic) {
    return state; // No topics available
  }

  const currentTopicEmails = briefingSnapshot.topicEmailMap[currentTopic] ?? [];
  const nextItemIndex = position.itemIndex + 1;

  // Move to next item in current topic
  if (nextItemIndex < currentTopicEmails.length) {
    return updateDriveState(state, {
      position: {
        itemIndex: nextItemIndex,
        currentEmailId: currentTopicEmails[nextItemIndex],
        itemsRemaining: position.itemsRemaining - 1,
        depth: 0, // Reset depth when moving to new item
      },
      lastAction: {
        type: 'NEXT_TOPIC',
        timestamp: new Date(),
      },
    });
  }

  // Move to next topic
  const nextTopicIndex = position.topicIndex + 1;
  if (nextTopicIndex < briefingSnapshot.topicIds.length) {
    const nextTopic = briefingSnapshot.topicIds[nextTopicIndex];
    const nextTopicEmails = nextTopic ? briefingSnapshot.topicEmailMap[nextTopic] ?? [] : [];

    return updateDriveState(state, {
      position: {
        topicIndex: nextTopicIndex,
        itemIndex: 0,
        totalItemsInTopic: nextTopicEmails.length,
        currentTopicId: nextTopic,
        currentEmailId: nextTopicEmails[0],
        itemsRemaining: position.itemsRemaining - 1,
        depth: 0,
      },
      lastAction: {
        type: 'NEXT_TOPIC',
        timestamp: new Date(),
      },
    });
  }

  // End of briefing
  return state;
}

/**
 * Navigate to previous item in briefing
 */
export function navigateToPreviousItem(state: DriveState): DriveState {
  const { position, briefingSnapshot } = state;

  // Move to previous item in current topic
  if (position.itemIndex > 0) {
    const currentTopic = briefingSnapshot.topicIds[position.topicIndex];
    const currentTopicEmails = currentTopic
      ? briefingSnapshot.topicEmailMap[currentTopic] ?? []
      : [];
    const prevItemIndex = position.itemIndex - 1;

    return updateDriveState(state, {
      position: {
        itemIndex: prevItemIndex,
        currentEmailId: currentTopicEmails[prevItemIndex],
        itemsRemaining: position.itemsRemaining + 1,
        depth: 0,
      },
      lastAction: {
        type: 'GO_BACK',
        timestamp: new Date(),
      },
    });
  }

  // Move to previous topic
  if (position.topicIndex > 0) {
    const prevTopicIndex = position.topicIndex - 1;
    const prevTopic = briefingSnapshot.topicIds[prevTopicIndex];
    const prevTopicEmails = prevTopic ? briefingSnapshot.topicEmailMap[prevTopic] ?? [] : [];
    const lastItemIndex = Math.max(0, prevTopicEmails.length - 1);

    return updateDriveState(state, {
      position: {
        topicIndex: prevTopicIndex,
        itemIndex: lastItemIndex,
        totalItemsInTopic: prevTopicEmails.length,
        currentTopicId: prevTopic,
        currentEmailId: prevTopicEmails[lastItemIndex],
        itemsRemaining: position.itemsRemaining + 1,
        depth: 0,
      },
      lastAction: {
        type: 'GO_BACK',
        timestamp: new Date(),
      },
    });
  }

  // Already at beginning
  return state;
}

/**
 * Skip current topic and move to next topic
 */
export function skipCurrentTopic(state: DriveState): DriveState {
  const { position, briefingSnapshot } = state;
  const nextTopicIndex = position.topicIndex + 1;

  if (nextTopicIndex >= briefingSnapshot.topicIds.length) {
    return state; // Already at last topic
  }

  const nextTopic = briefingSnapshot.topicIds[nextTopicIndex];
  const nextTopicEmails = nextTopic ? briefingSnapshot.topicEmailMap[nextTopic] ?? [] : [];

  // Calculate items skipped in current topic
  const currentTopic = briefingSnapshot.topicIds[position.topicIndex];
  const currentTopicEmails = currentTopic
    ? briefingSnapshot.topicEmailMap[currentTopic] ?? []
    : [];
  const itemsSkipped = currentTopicEmails.length - position.itemIndex;

  return updateDriveState(state, {
    position: {
      topicIndex: nextTopicIndex,
      itemIndex: 0,
      totalItemsInTopic: nextTopicEmails.length,
      currentTopicId: nextTopic,
      currentEmailId: nextTopicEmails[0],
      itemsRemaining: Math.max(0, position.itemsRemaining - itemsSkipped),
      depth: 0,
    },
    interruptStatus: InterruptStatus.SKIPPING,
    lastAction: {
      type: 'SKIP',
      timestamp: new Date(),
      target: currentTopic,
    },
  });
}

/**
 * Increase depth level for current item
 */
export function goDeeper(state: DriveState): DriveState {
  const maxDepth = 2; // 0 = summary, 1 = details, 2 = full thread

  if (state.position.depth >= maxDepth) {
    return state; // Already at maximum depth
  }

  return updateDriveState(state, {
    position: {
      depth: state.position.depth + 1,
    },
    interruptStatus: InterruptStatus.GOING_DEEPER,
    lastAction: {
      type: 'GO_DEEPER',
      timestamp: new Date(),
      target: state.position.currentEmailId,
      metadata: { depth: state.position.depth + 1 },
    },
  });
}

/**
 * Check if briefing is complete
 */
export function isBriefingComplete(state: DriveState): boolean {
  const { position, briefingSnapshot } = state;

  // Check if we're at the last topic
  if (position.topicIndex >= briefingSnapshot.topicIds.length - 1) {
    const lastTopic = briefingSnapshot.topicIds[position.topicIndex];
    const lastTopicEmails = lastTopic ? briefingSnapshot.topicEmailMap[lastTopic] ?? [] : [];

    // Check if we're at the last item in the last topic
    return position.itemIndex >= lastTopicEmails.length - 1;
  }

  return false;
}

/**
 * Get progress percentage (0-100)
 */
export function getProgressPercentage(state: DriveState): number {
  const { position, briefingSnapshot } = state;

  if (briefingSnapshot.totalEmails === 0) {
    return 100;
  }

  const itemsProcessed = briefingSnapshot.totalEmails - position.itemsRemaining;
  return Math.round((itemsProcessed / briefingSnapshot.totalEmails) * 100);
}

/**
 * Validate drive state structure
 */
export function validateDriveState(state: unknown): state is DriveState {
  if (typeof state !== 'object' || state === null) {
    return false;
  }

  const s = state as Partial<DriveState>;

  return (
    typeof s.sessionId === 'string' &&
    typeof s.userId === 'string' &&
    s.position !== undefined &&
    typeof s.position === 'object' &&
    s.interruptStatus !== undefined &&
    s.startedAt instanceof Date &&
    s.updatedAt instanceof Date &&
    s.briefingSnapshot !== undefined &&
    typeof s.briefingSnapshot === 'object' &&
    s.metadata !== undefined &&
    typeof s.metadata === 'object' &&
    typeof s.ttl === 'number'
  );
}
