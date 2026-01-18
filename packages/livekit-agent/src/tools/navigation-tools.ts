/**
 * @nexus-aec/livekit-agent - Navigation Tools
 *
 * GPT-4o function calling tools for briefing navigation:
 * - skip_topic
 * - next_item
 * - go_back
 * - repeat_that
 * - go_deeper
 * - pause_briefing
 * - resume_briefing
 * - stop_briefing
 */

import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'navigation-tools' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Tool definition for GPT-4o function calling
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
      }>;
      required: string[];
    };
  };
}

/**
 * Navigation result
 */
export interface NavigationResult {
  success: boolean;
  message: string;
  action: NavigationAction;
  data?: Record<string, unknown>;
}

/**
 * Navigation action types
 */
export type NavigationAction =
  | 'skip_topic'
  | 'next_item'
  | 'go_back'
  | 'repeat'
  | 'go_deeper'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'none';

/**
 * Briefing state for navigation
 */
export interface BriefingState {
  currentTopicIndex: number;
  currentItemIndex: number;
  totalTopics: number;
  topicItems: number[];
  isPaused: boolean;
  history: Array<{ topicIndex: number; itemIndex: number }>;
}

/**
 * Navigation executor function type
 */
export type NavigationExecutor = (
  args: Record<string, unknown>,
  state: BriefingState
) => NavigationResult;

// =============================================================================
// Tool Definitions
// =============================================================================

/**
 * Skip topic tool definition
 */
export const skipTopicTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'skip_topic',
    description: 'Skip the current topic entirely and move to the next one.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Optional reason for skipping (for learning)',
        },
      },
      required: [],
    },
  },
};

/**
 * Next item tool definition
 */
export const nextItemTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'next_item',
    description: 'Move to the next item within the current topic.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Go back tool definition
 */
export const goBackTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'go_back',
    description: 'Go back to the previous item or topic.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'string',
          description: 'How far to go back',
          enum: ['1', '2', '3', 'topic_start'],
        },
      },
      required: [],
    },
  },
};

/**
 * Repeat that tool definition
 */
export const repeatThatTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'repeat_that',
    description: 'Repeat the last thing that was said.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Go deeper tool definition
 */
export const goDeeperTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'go_deeper',
    description: 'Get more details about the current item (read full email, thread context, etc.).',
    parameters: {
      type: 'object',
      properties: {
        aspect: {
          type: 'string',
          description: 'What aspect to explore',
          enum: ['full_email', 'thread_history', 'sender_info', 'attachments', 'related_emails'],
        },
      },
      required: [],
    },
  },
};

/**
 * Pause briefing tool definition
 */
export const pauseBriefingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pause_briefing',
    description: 'Pause the current briefing. Can be resumed later.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Resume briefing tool definition
 */
export const resumeBriefingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'resume_briefing',
    description: 'Resume a paused briefing from where it left off.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
};

/**
 * Stop briefing tool definition
 */
export const stopBriefingTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'stop_briefing',
    description: 'Stop the briefing entirely.',
    parameters: {
      type: 'object',
      properties: {
        save_progress: {
          type: 'string',
          description: 'Whether to save progress for next time',
          enum: ['true', 'false'],
        },
      },
      required: [],
    },
  },
};

// =============================================================================
// All Navigation Tools
// =============================================================================

/**
 * All navigation tool definitions
 */
export const NAVIGATION_TOOLS: ToolDefinition[] = [
  skipTopicTool,
  nextItemTool,
  goBackTool,
  repeatThatTool,
  goDeeperTool,
  pauseBriefingTool,
  resumeBriefingTool,
  stopBriefingTool,
];

/**
 * Get tool by name
 */
export function getNavigationTool(name: string): ToolDefinition | undefined {
  return NAVIGATION_TOOLS.find((t) => t.function.name === name);
}

// =============================================================================
// Tool Executors
// =============================================================================

/**
 * Execute skip_topic
 */
export function executeSkipTopic(
  args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const reason = args['reason'] as string | undefined;

  logger.info('Executing skip_topic', { reason, currentTopic: state.currentTopicIndex });

  if (state.currentTopicIndex >= state.totalTopics - 1) {
    return {
      success: false,
      message: "You're on the last topic. Nothing to skip to.",
      action: 'none',
    };
  }

  return {
    success: true,
    message: 'Skipping to the next topic.',
    action: 'skip_topic',
    data: {
      newTopicIndex: state.currentTopicIndex + 1,
      skippedReason: reason,
    },
  };
}

/**
 * Execute next_item
 */
export function executeNextItem(
  _args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const currentTopicItemCount = state.topicItems[state.currentTopicIndex] ?? 0;

  logger.info('Executing next_item', { 
    currentTopic: state.currentTopicIndex,
    currentItem: state.currentItemIndex,
    topicItemCount: currentTopicItemCount,
  });

  if (state.currentItemIndex >= currentTopicItemCount - 1) {
    // End of current topic, move to next
    if (state.currentTopicIndex >= state.totalTopics - 1) {
      return {
        success: true,
        message: "That's the last item. Your briefing is complete.",
        action: 'stop',
      };
    }

    return {
      success: true,
      message: 'Moving to the next topic.',
      action: 'skip_topic',
      data: {
        newTopicIndex: state.currentTopicIndex + 1,
        newItemIndex: 0,
      },
    };
  }

  return {
    success: true,
    message: 'Moving on.',
    action: 'next_item',
    data: {
      newItemIndex: state.currentItemIndex + 1,
    },
  };
}

/**
 * Execute go_back
 */
export function executeGoBack(
  args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const steps = args['steps'] as string ?? '1';

  logger.info('Executing go_back', { steps, history: state.history.length });

  if (steps === 'topic_start') {
    return {
      success: true,
      message: 'Going back to the start of this topic.',
      action: 'go_back',
      data: { newItemIndex: 0 },
    };
  }

  const numSteps = parseInt(steps, 10);

  if (state.history.length < numSteps) {
    return {
      success: false,
      message: `Can't go back ${numSteps} steps. You've only covered ${state.history.length} items.`,
      action: 'none',
    };
  }

  const targetPosition = state.history[state.history.length - numSteps];

  return {
    success: true,
    message: numSteps === 1 ? 'Going back.' : `Going back ${numSteps} items.`,
    action: 'go_back',
    data: {
      newTopicIndex: targetPosition?.topicIndex,
      newItemIndex: targetPosition?.itemIndex,
    },
  };
}

/**
 * Execute repeat_that
 */
export function executeRepeatThat(
  _args: Record<string, unknown>,
  _state: BriefingState
): NavigationResult {
  logger.info('Executing repeat_that');

  return {
    success: true,
    message: '',  // The actual repeat is handled by the reasoning loop
    action: 'repeat',
  };
}

/**
 * Execute go_deeper
 */
export function executeGoDeeper(
  args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const aspect = (args['aspect'] as string) ?? 'full_email';

  logger.info('Executing go_deeper', { aspect, currentItem: state.currentItemIndex });

  return {
    success: true,
    message: `Getting more details...`,
    action: 'go_deeper',
    data: { aspect },
  };
}

/**
 * Execute pause_briefing
 */
export function executePauseBriefing(
  _args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  logger.info('Executing pause_briefing', { 
    currentTopic: state.currentTopicIndex,
    currentItem: state.currentItemIndex,
  });

  if (state.isPaused) {
    return {
      success: false,
      message: 'The briefing is already paused.',
      action: 'none',
    };
  }

  return {
    success: true,
    message: 'Pausing the briefing. Just say "resume" when you\'re ready.',
    action: 'pause',
  };
}

/**
 * Execute resume_briefing
 */
export function executeResumeBriefing(
  _args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  logger.info('Executing resume_briefing');

  if (!state.isPaused) {
    return {
      success: false,
      message: 'The briefing is not paused.',
      action: 'none',
    };
  }

  return {
    success: true,
    message: 'Resuming the briefing.',
    action: 'resume',
  };
}

/**
 * Execute stop_briefing
 */
export function executeStopBriefing(
  args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const saveProgress = (args['save_progress'] as string) !== 'false';

  logger.info('Executing stop_briefing', { saveProgress, currentPosition: state.currentItemIndex });

  const remainingItems = state.topicItems.reduce((sum, count) => sum + count, 0) - 
    state.topicItems.slice(0, state.currentTopicIndex).reduce((sum, count) => sum + count, 0) -
    state.currentItemIndex - 1;

  return {
    success: true,
    message: remainingItems > 0 
      ? `Stopping the briefing. You have ${remainingItems} items remaining.` 
      : "That's your briefing complete.",
    action: 'stop',
    data: { saveProgress },
  };
}

// =============================================================================
// Tool Executor Registry
// =============================================================================

/**
 * Map of tool names to executors
 */
export const NAVIGATION_TOOL_EXECUTORS: Record<string, NavigationExecutor> = {
  skip_topic: executeSkipTopic,
  next_item: executeNextItem,
  go_back: executeGoBack,
  repeat_that: executeRepeatThat,
  go_deeper: executeGoDeeper,
  pause_briefing: executePauseBriefing,
  resume_briefing: executeResumeBriefing,
  stop_briefing: executeStopBriefing,
};

/**
 * Execute a navigation tool by name
 */
export function executeNavigationTool(
  toolName: string,
  args: Record<string, unknown>,
  state: BriefingState
): NavigationResult {
  const executor = NAVIGATION_TOOL_EXECUTORS[toolName];

  if (!executor) {
    logger.warn('Unknown navigation tool', { toolName });
    return {
      success: false,
      message: `Unknown navigation: ${toolName}`,
      action: 'none',
    };
  }

  try {
    return executor(args, state);
  } catch (error) {
    logger.error('Navigation execution error', error instanceof Error ? error : new Error(String(error)));
    return {
      success: false,
      message: `Navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      action: 'none',
    };
  }
}

// =============================================================================
// Briefing State Management
// =============================================================================

/**
 * Create initial briefing state
 */
export function createBriefingState(topicItems: number[]): BriefingState {
  return {
    currentTopicIndex: 0,
    currentItemIndex: 0,
    totalTopics: topicItems.length,
    topicItems,
    isPaused: false,
    history: [],
  };
}

/**
 * Update briefing state after navigation
 */
export function updateBriefingState(
  state: BriefingState,
  result: NavigationResult
): BriefingState {
  // Record current position in history before changing
  const history = [...state.history, {
    topicIndex: state.currentTopicIndex,
    itemIndex: state.currentItemIndex,
  }];

  const data = result.data ?? {};

  switch (result.action) {
    case 'skip_topic':
      return {
        ...state,
        currentTopicIndex: (data['newTopicIndex'] as number) ?? state.currentTopicIndex + 1,
        currentItemIndex: (data['newItemIndex'] as number) ?? 0,
        history,
      };

    case 'next_item':
      return {
        ...state,
        currentItemIndex: (data['newItemIndex'] as number) ?? state.currentItemIndex + 1,
        history,
      };

    case 'go_back':
      return {
        ...state,
        currentTopicIndex: (data['newTopicIndex'] as number) ?? state.currentTopicIndex,
        currentItemIndex: (data['newItemIndex'] as number) ?? state.currentItemIndex,
        // Don't add to history when going back
        history: state.history.slice(0, -1),
      };

    case 'pause':
      return {
        ...state,
        isPaused: true,
      };

    case 'resume':
      return {
        ...state,
        isPaused: false,
      };

    case 'stop':
      return state; // No state change, handled externally

    default:
      return state;
  }
}
