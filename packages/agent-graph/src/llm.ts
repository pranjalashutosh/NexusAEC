/**
 * `ChatOpenAI` factory (plan §7/§10.2).
 *
 * Single construction point for the GPT-4o reasoning model used by the graphs,
 * with built-in retries and logger callbacks. Voice Node conversational turns
 * use the same factory with `model: 'gpt-4o-mini'` (D6).
 *
 * This is also where `exactOptionalPropertyTypes` friction with LangChain's
 * generics is absorbed once — optional fields are applied via conditional
 * spread so we never hand LangChain an explicit `undefined`.
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatOpenAI } from '@langchain/openai';
import { logger } from '@nexus-aec/logger';

const log = logger.child({ module: 'agent-graph:llm' });

/** GPT-4o stays the reasoning model (D6). */
export const DEFAULT_CHAT_MODEL = 'gpt-4o';
/** Voice Node conversational model (D6). */
export const VOICE_CHAT_MODEL = 'gpt-4o-mini';

export interface CreateChatModelOptions {
  /** Default `gpt-4o`. */
  model?: string;
  /** Default `0`. */
  temperature?: number;
  /** Default `3`. */
  maxRetries?: number;
  /** Falls back to `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** LangSmith / run tags. */
  tags?: string[];
}

/** A logging handler that surfaces LLM failures through `@nexus-aec/logger`. */
function loggingHandler(): BaseCallbackHandler {
  return BaseCallbackHandler.fromMethods({
    handleLLMError(err: Error) {
      log.error('LLM call failed', err);
    },
    handleLLMEnd() {
      log.debug('LLM call completed');
    },
  });
}

/**
 * Build a configured `ChatOpenAI`. Throws if no API key is available so a
 * misconfiguration fails fast at startup rather than mid-run.
 */
export function createChatModel(options: CreateChatModelOptions = {}): ChatOpenAI {
  const apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required to create a ChatOpenAI model.');
  }
  return new ChatOpenAI({
    model: options.model ?? DEFAULT_CHAT_MODEL,
    temperature: options.temperature ?? 0,
    maxRetries: options.maxRetries ?? 3,
    apiKey,
    callbacks: [loggingHandler()],
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
    ...(options.tags !== undefined ? { tags: options.tags } : {}),
  });
}
