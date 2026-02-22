/**
 * Prompts module exports
 */

// System prompt
export {
  buildSystemPrompt,
  getDefaultSystemPrompt,
  type SystemPromptContext,
  DEFAULT_SYSTEM_PROMPT_CONTEXT,
  PERSONA,
  SAFETY_CONSTRAINTS,
  TOOL_INSTRUCTIONS,
  RESPONSE_FORMAT,
  CONFIRMATION_RULES,
  DISAMBIGUATION_RULES,
} from './system-prompt.js';

// Briefing prompts
export {
  generateTopicTransition,
  generateProgressUpdate,
  generateEmailSummaryPrompt,
  generateRedFlagPrompt,
  generateThreadSummaryPrompt,
  generateConfirmation,
  generateDisambiguationPrompt,
  generateBriefingOpening,
  generateBriefingClosing,
  generatePausePrompt,
  CONFIRMATION_TEMPLATES,
  getTimeAgo,
  type EmailSummaryInput,
  type BriefingTopicPrompt,
  type BriefingContext,
} from './briefing-prompts.js';
