/**
 * @nexus-aec/livekit-agent - Voice Utilities
 *
 * Text cleaning utilities for voice-friendly output.
 * Strips special characters, URLs, and other artifacts
 * that sound unnatural when read aloud by TTS.
 */

/**
 * Clean an email subject line for natural voice presentation.
 *
 * - Strips URLs and email addresses
 * - Removes domain suffixes (.org, .com, .net, etc.)
 * - Replaces "$N" with "N dollars", "%" with "percent"
 * - Strips brackets [], tracking IDs like [JIRA-123]
 * - Removes excessive punctuation
 * - Collapses whitespace
 */
export function cleanSubjectForVoice(subject: string): string {
  let cleaned = subject;

  // Remove URLs (http/https/www)
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, '');
  cleaned = cleaned.replace(/www\.\S+/gi, '');

  // Remove email addresses
  cleaned = cleaned.replace(/[\w.+-]+@[\w.-]+\.\w+/g, '');

  // Remove bracketed tracking IDs like [JIRA-123], [EXT], [ACTION REQUIRED]
  cleaned = cleaned.replace(/\[[A-Z0-9][-A-Z0-9]*\d+\]/gi, '');

  // Remove domain suffixes that sound awkward when spoken
  cleaned = cleaned.replace(/\.(org|com|net|io|co|edu|gov|dev|app)\b/gi, '');

  // Replace currency: $N → N dollars
  cleaned = cleaned.replace(/\$(\d[\d,]*\.?\d*)/g, '$1 dollars');

  // Replace percent sign
  cleaned = cleaned.replace(/(\d)\s*%/g, '$1 percent');

  // Strip remaining brackets
  cleaned = cleaned.replace(/[[\]]/g, '');

  // Remove excessive punctuation (keep single commas, periods, question marks)
  cleaned = cleaned.replace(/[|~^`]/g, '');
  cleaned = cleaned.replace(/:{2,}/g, ':');
  cleaned = cleaned.replace(/-{2,}/g, ' ');
  cleaned = cleaned.replace(/_{2,}/g, ' ');

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}
