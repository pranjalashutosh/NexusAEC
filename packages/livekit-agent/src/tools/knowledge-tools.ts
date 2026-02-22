/**
 * @nexus-aec/livekit-agent - Knowledge Tools
 *
 * GPT-4o function calling tools for persistent memory:
 * - save_to_memory: Store rules, preferences, feedback, context across sessions
 * - recall_knowledge: Search uploaded documents via RAG (Phase 2)
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
      'Search the knowledge base for information from uploaded documents (PDFs, CSVs, manuals). Use this when the user asks about domain-specific information that might be in their uploaded files.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query describing what information you need.',
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
 * Execute recall_knowledge: search uploaded documents via RAG.
 * Phase 2 — returns a placeholder until file upload + RAG is wired.
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

  // Phase 2: Wire to RAGRetriever here.
  // For now, return a helpful message indicating no documents are uploaded.
  logger.info('recall_knowledge called (Phase 2 stub)', { query });

  return {
    success: false,
    message:
      "I don't have any uploaded documents to search yet. You can upload files through the app to build your knowledge base.",
    riskLevel: 'low',
  };
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
