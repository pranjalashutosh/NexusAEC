/**
 * @nexus-aec/livekit-agent - Knowledge Tools
 *
 * GPT-4o function calling tools for persistent memory:
 * - save_to_memory: Store rules, preferences, feedback, context across sessions
 * - recall_knowledge: Search saved memory entries by keyword
 */

import { createLogger } from '@nexus-aec/logger';

import type { ToolDefinition, ToolResult } from './email-tools.js';
import type { UserKnowledgeStore } from '../knowledge/user-knowledge-store.js';

const logger = createLogger({ baseContext: { component: 'knowledge-tools' } });

// =============================================================================
// Service Registry
// =============================================================================

let _knowledgeStore: UserKnowledgeStore | null = null;
let _currentUserId: string | null = null;

/**
 * Register the knowledge store for use by tool executors.
 * Call this after loading the user's knowledge document at session start.
 */
export function setKnowledgeStore(store: UserKnowledgeStore, userId: string): void {
  _knowledgeStore = store;
  _currentUserId = userId;
  logger.info('Knowledge store registered', { userId });
}

/**
 * Clear the knowledge store (call on disconnect/shutdown).
 */
export function clearKnowledgeStore(): void {
  _knowledgeStore = null;
  _currentUserId = null;
  logger.info('Knowledge store cleared');
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const saveToMemoryTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'save_to_memory',
    description:
      'Save important information to your memory for future sessions. Use this when the user gives you a standing instruction, states a preference, provides feedback on your behavior, or when you observe something important about their work patterns. Do NOT save email content (subject, body, or sender details) — only save rules, preferences, and behavioral instructions.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The information to remember. Write it as a clear, actionable statement.',
        },
        category: {
          type: 'string',
          description: 'The type of knowledge being saved.',
          enum: ['rule', 'preference', 'feedback', 'context'],
        },
      },
      required: ['content', 'category'],
    },
  },
};

export const recallKnowledgeTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'recall_knowledge',
    description:
      'Search your saved memory for rules, preferences, and feedback the user has given you in past sessions. Use this when the user asks "do you remember", "what are my preferences", or when you need to check if there are standing instructions.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query describing what you want to recall (e.g., "email preferences", "filtering rules", "Quora").',
        },
      },
      required: ['query'],
    },
  },
};

// =============================================================================
// All Knowledge Tools
// =============================================================================

export const KNOWLEDGE_TOOLS: ToolDefinition[] = [saveToMemoryTool, recallKnowledgeTool];

export function getKnowledgeTool(name: string): ToolDefinition | undefined {
  return KNOWLEDGE_TOOLS.find((t) => t.function.name === name);
}

// =============================================================================
// Tool Executors
// =============================================================================

const VALID_CATEGORIES = ['rule', 'preference', 'feedback', 'context'] as const;
type KnowledgeCategory = (typeof VALID_CATEGORIES)[number];

/**
 * Execute save_to_memory: persist a knowledge entry for this user.
 */
export async function executeSaveToMemory(args: Record<string, unknown>): Promise<ToolResult> {
  if (!_knowledgeStore || !_currentUserId) {
    return {
      success: false,
      message: 'Memory is not available right now.',
      riskLevel: 'low',
    };
  }

  const content = args['content'] as string | undefined;
  const category = args['category'] as string | undefined;

  if (!content || content.trim().length === 0) {
    return {
      success: false,
      message: 'No content provided to save.',
      riskLevel: 'low',
    };
  }

  if (!category || !VALID_CATEGORIES.includes(category as KnowledgeCategory)) {
    return {
      success: false,
      message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      riskLevel: 'low',
    };
  }

  try {
    const entry = await _knowledgeStore.append(_currentUserId, {
      content: content.trim(),
      category: category as KnowledgeCategory,
      source: 'user',
    });

    logger.info('Knowledge saved via tool', {
      userId: _currentUserId,
      entryId: entry.id,
      category,
      contentLength: content.length,
    });

    return {
      success: true,
      message: "Got it, I'll remember that.",
      data: { entryId: entry.id, category },
      riskLevel: 'low',
    };
  } catch (error) {
    logger.error(
      'save_to_memory failed',
      error instanceof Error ? error : new Error(String(error))
    );
    return {
      success: false,
      message:
        "I wasn't able to save that right now. I'll try to keep it in mind for this session.",
      riskLevel: 'low',
    };
  }
}

/**
 * Execute recall_knowledge: search the user's saved memory for matching entries.
 */
export async function executeRecallKnowledge(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args['query'] as string | undefined;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      message: 'No search query provided.',
      riskLevel: 'low',
    };
  }

  if (!_knowledgeStore || !_currentUserId) {
    return {
      success: false,
      message: 'Memory is not available right now.',
      riskLevel: 'low',
    };
  }

  try {
    const doc = await _knowledgeStore.get(_currentUserId);

    if (doc.entries.length === 0) {
      return {
        success: true,
        message:
          "I don't have any saved memories yet. You can ask me to remember things for future sessions.",
        riskLevel: 'low',
      };
    }

    // Keyword-match against the query
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const matches = doc.entries.filter((entry) => {
      const text = `${entry.content} ${entry.category}`.toLowerCase();
      return queryWords.some((word) => text.includes(word));
    });

    // Fall back to all entries if no keyword matches (document is small, ≤30 entries)
    const results = matches.length > 0 ? matches : doc.entries;

    const formatted = results.map((e) => `[${e.category}] ${e.content}`).join('\n');

    logger.info('recall_knowledge matched', {
      userId: _currentUserId,
      query,
      totalEntries: doc.entries.length,
      matchCount: matches.length,
      returnedAll: matches.length === 0,
    });

    return {
      success: true,
      message:
        matches.length > 0
          ? `Found ${matches.length} matching memor${matches.length === 1 ? 'y' : 'ies'}:\n${formatted}`
          : `No exact matches for "${query}", but here is everything I remember:\n${formatted}`,
      data: {
        matchCount: results.length,
        entries: results.map((e) => ({ category: e.category, content: e.content })),
      },
      riskLevel: 'low',
    };
  } catch (error) {
    logger.error(
      'recall_knowledge failed',
      error instanceof Error ? error : new Error(String(error))
    );
    return {
      success: false,
      message: "I wasn't able to search my memory right now.",
      riskLevel: 'low',
    };
  }
}

// =============================================================================
// Tool Executor Registry
// =============================================================================

export const KNOWLEDGE_TOOL_EXECUTORS: Record<
  string,
  (args: Record<string, unknown>) => Promise<ToolResult>
> = {
  save_to_memory: executeSaveToMemory,
  recall_knowledge: executeRecallKnowledge,
};

/**
 * Execute a knowledge tool by name
 */
export async function executeKnowledgeTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const executor = KNOWLEDGE_TOOL_EXECUTORS[toolName];

  if (!executor) {
    logger.warn('Unknown knowledge tool', { toolName });
    return {
      success: false,
      message: `Unknown action: ${toolName}`,
      riskLevel: 'low',
    };
  }

  try {
    return await executor(args);
  } catch (error) {
    logger.error(
      'Knowledge tool execution error',
      error instanceof Error ? error : new Error(String(error))
    );
    return {
      success: false,
      message: `Failed to ${toolName.replace('_', ' ')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      riskLevel: 'low',
    };
  }
}
