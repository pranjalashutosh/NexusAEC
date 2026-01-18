/**
 * Explanation Generator (Tier 3)
 *
 * Generates natural language explanations for why emails are flagged as urgent.
 * Converts technical red flag scoring into user-friendly explanations.
 */

import type { LLMClient, LLMMessage } from './llm-client';
import type { RedFlagScore } from '../red-flags/scorer';
import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';

/**
 * Explanation style
 */
export type ExplanationStyle = 'detailed' | 'concise' | 'technical' | 'casual';

/**
 * Generated explanation
 */
export interface RedFlagExplanation {
  /**
   * Main explanation text
   */
  explanation: string;

  /**
   * Key factors (bullet points)
   */
  keyFactors: string[];

  /**
   * Suggested action (optional)
   */
  suggestedAction?: string;

  /**
   * Urgency level description
   */
  urgencyLevel: string;

  /**
   * Style used
   */
  style: ExplanationStyle;

  /**
   * Generation time in milliseconds
   */
  generationTimeMs: number;

  /**
   * Token usage
   */
  tokensUsed: number;
}

/**
 * Explanation generator options
 */
export interface ExplanationGeneratorOptions {
  /**
   * LLM client instance
   */
  llmClient: LLMClient;

  /**
   * Default explanation style
   * Default: 'detailed'
   */
  defaultStyle?: ExplanationStyle;

  /**
   * Whether to include suggested actions
   * Default: true
   */
  includeSuggestedAction?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Explanation Generator
 *
 * Generates natural language explanations for red flag scores.
 * Converts technical scoring reasons into user-friendly explanations
 * suitable for voice delivery.
 *
 * @example
 * ```typescript
 * import { ExplanationGenerator, LLMClient } from '@nexus-aec/intelligence';
 *
 * const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
 * const generator = new ExplanationGenerator({
 *   llmClient,
 *   defaultStyle: 'detailed',
 * });
 *
 * const explanation = await generator.explain(redFlagScore, email);
 * console.log(explanation.explanation);
 * console.log('Key factors:');
 * explanation.keyFactors.forEach(factor => console.log(`- ${factor}`));
 * ```
 */
export class ExplanationGenerator {
  private llmClient: LLMClient;
  private defaultStyle: ExplanationStyle;
  private includeSuggestedAction: boolean;
  private debug: boolean;

  constructor(options: ExplanationGeneratorOptions) {
    this.llmClient = options.llmClient;
    this.defaultStyle = options.defaultStyle ?? 'detailed';
    this.includeSuggestedAction = options.includeSuggestedAction ?? true;
    this.debug = options.debug ?? false;
  }

  /**
   * Generate explanation for a red flag score
   *
   * @param score - Red flag score to explain
   * @param email - Email that was scored
   * @param options - Generation options
   * @returns Explanation
   */
  async explain(
    score: RedFlagScore,
    email: StandardEmail,
    options: { style?: ExplanationStyle; thread?: StandardThread } = {}
  ): Promise<RedFlagExplanation> {
    const style = options.style ?? this.defaultStyle;
    const startTime = Date.now();

    if (this.debug) {
      console.log(
        `[ExplanationGenerator] Generating explanation for email ${email.id} (score: ${score.score.toFixed(2)}, style: ${style})`
      );
    }

    const systemPrompt = this.getStyleSystemPrompt(style);
    const userPrompt = this.buildExplanationPrompt(score, email, options.thread, style);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.llmClient.complete(messages, {
      temperature: 0.5,
      maxTokens: style === 'concise' ? 200 : style === 'detailed' ? 400 : 300,
    });

    const generationTimeMs = Date.now() - startTime;

    // Parse the LLM response
    const parsed = this.parseExplanation(result.content, score, style);

    if (this.debug) {
      console.log(
        `[ExplanationGenerator] Generated explanation in ${generationTimeMs}ms (${result.totalTokens} tokens)`
      );
    }

    return {
      ...parsed,
      style,
      generationTimeMs,
      tokensUsed: result.totalTokens,
    };
  }

  /**
   * Generate explanation without LLM (rule-based)
   *
   * @param score - Red flag score to explain
   * @param email - Email that was scored
   * @returns Basic explanation
   */
  explainBasic(score: RedFlagScore, _email: StandardEmail): RedFlagExplanation {
    const keyFactors: string[] = [];
    let explanation = '';

    // Build factors from scoring reasons
    for (const reason of score.reasons) {
      keyFactors.push(reason.description);
    }

    // Build explanation based on severity
    if (!score.isFlagged) {
      explanation = 'This email does not require immediate attention.';
    } else if (score.score >= 0.8) {
      // Critical threshold (score >= 80%)
      explanation = `This email requires immediate attention with a priority score of ${(score.score * 100).toFixed(0)}%. ${keyFactors[0] || 'Multiple urgency indicators detected.'}`;
    } else if (score.severity === 'high') {
      explanation = `This email is high priority with a score of ${(score.score * 100).toFixed(0)}%. ${keyFactors[0] || 'Several urgency indicators detected.'}`;
    } else if (score.severity === 'medium') {
      explanation = `This email has medium priority with a score of ${(score.score * 100).toFixed(0)}%. ${keyFactors[0] || 'Some urgency indicators detected.'}`;
    } else {
      explanation = `This email has low priority with a score of ${(score.score * 100).toFixed(0)}%. ${keyFactors[0] || 'Minor urgency indicators detected.'}`;
    }

    return {
      explanation,
      keyFactors: keyFactors.slice(0, 3),
      urgencyLevel: this.getUrgencyLevelDescription(score),
      style: 'concise',
      generationTimeMs: 0,
      tokensUsed: 0,
    };
  }

  /**
   * Build prompt for explanation generation
   */
  private buildExplanationPrompt(
    score: RedFlagScore,
    email: StandardEmail,
    thread: StandardThread | undefined,
    style: ExplanationStyle
  ): string {
    const parts: string[] = [];

    parts.push('Generate a natural explanation for why this email is flagged:');
    parts.push('');

    // Email context
    parts.push(`From: ${email.from.name || email.from.email}`);
    parts.push(`Subject: ${email.subject}`);
    if (thread) {
      parts.push(`Thread: ${thread.messageCount} messages`);
    }
    parts.push('');

    // Scoring information
    parts.push(`Priority Score: ${(score.score * 100).toFixed(0)}%`);
    if (score.severity) {
      parts.push(`Severity: ${score.severity}`);
    }
    parts.push('');

    // Reasons
    if (score.reasons.length > 0) {
      parts.push('Urgency Indicators:');
      score.reasons.forEach((reason) => {
        parts.push(`- ${reason.description}`);
      });
      parts.push('');
    }

    // Signal breakdown
    if (score.signalBreakdown.length > 0) {
      parts.push('Contributing Factors:');
      score.signalBreakdown
        .filter((s) => s.isPresent)
        .forEach((signal) => {
          parts.push(
            `- ${signal.signal}: ${(signal.rawScore * 100).toFixed(0)}% (weight: ${signal.weight})`
          );
        });
      parts.push('');
    }

    // Style-specific instructions
    switch (style) {
      case 'detailed':
        parts.push(
          'Generate a detailed explanation (3-4 sentences) that clearly describes why this email needs attention. Include specific factors and their significance.'
        );
        break;

      case 'concise':
        parts.push(
          'Generate a concise explanation (1-2 sentences) that quickly conveys why this email is important.'
        );
        break;

      case 'technical':
        parts.push(
          'Generate a technical explanation that includes scoring details and specific signal contributions.'
        );
        break;

      case 'casual':
        parts.push(
          'Generate a casual, conversational explanation as if explaining to a colleague over coffee.'
        );
        break;
    }

    parts.push('');
    parts.push(
      'Then, list 2-4 key factors as bullet points that contributed to this flagging.'
    );

    if (this.includeSuggestedAction) {
      parts.push('');
      parts.push(
        'Finally, suggest one specific action the user should take (optional, only if appropriate).'
      );
    }

    return parts.join('\n');
  }

  /**
   * Parse LLM response into structured explanation
   */
  private parseExplanation(
    content: string,
    score: RedFlagScore,
    _style: ExplanationStyle
  ): Omit<RedFlagExplanation, 'style' | 'generationTimeMs' | 'tokensUsed'> {
    const lines = content.split('\n').map((line) => line.trim());

    let explanation = '';
    const keyFactors: string[] = [];
    let suggestedAction: string | undefined;

    let currentSection: 'explanation' | 'factors' | 'action' = 'explanation';
    const explanationLines: string[] = [];

    for (const line of lines) {
      if (!line) {continue;}

      // Detect section headers
      if (
        /^(key factors?|factors?|reasons?|why|indicators?):?$/i.test(line) ||
        /^-{3,}$/.test(line)
      ) {
        currentSection = 'factors';
        continue;
      }

      // Check for suggested action header (can be on same line as content)
      const actionHeaderMatch = line.match(/^(suggested action|action|recommendation):\s*(.*)$/i);
      if (actionHeaderMatch) {
        currentSection = 'action';
        const actionContent = (actionHeaderMatch[2] ?? '').trim();
        if (actionContent) {
          suggestedAction = actionContent;
        }
        continue;
      }

      // Parse based on current section
      if (currentSection === 'explanation') {
        // Skip section headers in explanation
        if (!/^(explanation|summary):?$/i.test(line)) {
          explanationLines.push(line);
        }
      } else if (currentSection === 'factors') {
        // Extract bullet points
        const bulletMatch = line.match(/^[-*•]\s*(.+)$/);
        if (bulletMatch) {
          const factor = (bulletMatch[1] ?? '').trim();
          if (factor) {
            keyFactors.push(factor);
          }
        } else if (line && keyFactors.length === 0) {
          // If no bullet format, treat as factor
          keyFactors.push(line);
        }
      } else if (currentSection === 'action') {
        if (!suggestedAction) {
          const actionMatch = line.match(/^[-*•]\s*(.+)$/);
          suggestedAction = actionMatch ? (actionMatch[1] ?? '').trim() : line;
          if (!suggestedAction) {
            suggestedAction = undefined;
          }
        }
      }
    }

    explanation = explanationLines.join(' ').trim();

    // Fallback if parsing failed
    if (!explanation) {
      explanation = content
        .split('\n')
        .filter((line) => line.trim() && !/^[-*•]/.test(line.trim()))
        .join(' ')
        .trim();
    }

    if (keyFactors.length === 0 && score.reasons.length > 0) {
      keyFactors.push(...score.reasons.slice(0, 3).map((r) => r.description));
    }

    return {
      explanation: explanation || 'This email has been flagged for your attention.',
      keyFactors: keyFactors.slice(0, 4),
      ...(this.includeSuggestedAction && suggestedAction
        ? { suggestedAction }
        : {}),
      urgencyLevel: this.getUrgencyLevelDescription(score),
    };
  }

  /**
   * Get urgency level description
   */
  private getUrgencyLevelDescription(score: RedFlagScore): string {
    if (!score.isFlagged) {
      return 'Normal priority';
    }

    // Check for critical score threshold first
    if (score.score >= 0.8) {
      return 'Critical - Immediate attention required';
    }

    switch (score.severity) {
      case 'high':
        return 'High priority - Requires prompt attention';
      case 'medium':
        return 'Medium priority - Should be reviewed soon';
      case 'low':
        return 'Low priority - Can be reviewed when convenient';
      default:
        return 'Flagged for attention';
    }
  }

  /**
   * Get system prompt for explanation style
   */
  private getStyleSystemPrompt(style: ExplanationStyle): string {
    const basePrompt =
      'You are an executive assistant explaining why an email requires attention. Generate clear, actionable explanations.';

    switch (style) {
      case 'detailed':
        return `${basePrompt} Provide thorough explanations with context and specific details.`;

      case 'concise':
        return `${basePrompt} Be brief and direct. Get to the point quickly.`;

      case 'technical':
        return `${basePrompt} Include technical details about scoring and signal contributions. Use precise language.`;

      case 'casual':
        return `${basePrompt} Use conversational, friendly language as if talking to a colleague.`;

      default:
        return basePrompt;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    defaultStyle: ExplanationStyle;
    includeSuggestedAction: boolean;
  } {
    return {
      defaultStyle: this.defaultStyle,
      includeSuggestedAction: this.includeSuggestedAction,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: {
    defaultStyle?: ExplanationStyle;
    includeSuggestedAction?: boolean;
  }): void {
    if (config.defaultStyle !== undefined) {
      this.defaultStyle = config.defaultStyle;
    }
    if (config.includeSuggestedAction !== undefined) {
      this.includeSuggestedAction = config.includeSuggestedAction;
    }
  }
}
