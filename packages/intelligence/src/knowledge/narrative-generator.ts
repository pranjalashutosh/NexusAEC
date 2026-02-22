/**
 * Narrative Generator (Tier 3)
 *
 * Converts email clusters, red flag scores, and summaries into
 * podcast-style briefing scripts for voice delivery.
 */

import type { EmailSummary } from './email-summarizer';
import type { LLMClient, LLMMessage } from './llm-client';
import type { RedFlagScore } from '../red-flags/scorer';
import type { TopicCluster } from '../red-flags/topic-clusterer';

/**
 * Narrative style
 */
export type NarrativeStyle = 'formal' | 'conversational' | 'executive' | 'concise';

/**
 * Script section type
 */
export type ScriptSection = 'opening' | 'topic' | 'closing' | 'transition';

/**
 * Script segment
 */
export interface ScriptSegment {
  /**
   * Section type
   */
  type: ScriptSection;

  /**
   * Narrative content
   */
  content: string;

  /**
   * Topic/cluster ID (for topic sections)
   */
  topicId?: string;

  /**
   * Estimated reading time in seconds
   */
  estimatedSeconds: number;
}

/**
 * Generated briefing script
 */
export interface BriefingScript {
  /**
   * Script segments in order
   */
  segments: ScriptSegment[];

  /**
   * Total estimated reading time in seconds
   */
  totalSeconds: number;

  /**
   * Number of topics covered
   */
  topicCount: number;

  /**
   * Number of red flags mentioned
   */
  redFlagCount: number;

  /**
   * Narrative style used
   */
  style: NarrativeStyle;

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
 * Briefing input data
 */
export interface BriefingInput {
  /**
   * Topic clusters
   */
  clusters: TopicCluster[];

  /**
   * Red flag scores by email ID
   */
  redFlagScores: Map<string, RedFlagScore>;

  /**
   * Email summaries by email ID or thread ID
   */
  summaries: Map<string, EmailSummary>;

  /**
   * User's name (optional)
   */
  userName?: string;

  /**
   * Current date/time for context
   */
  currentTime?: Date;
}

/**
 * Narrative generator options
 */
export interface NarrativeGeneratorOptions {
  /**
   * LLM client instance
   */
  llmClient: LLMClient;

  /**
   * Default narrative style
   * Default: 'conversational'
   */
  defaultStyle?: NarrativeStyle;

  /**
   * Maximum topics to include in briefing
   * Default: 10
   */
  maxTopics?: number;

  /**
   * Whether to include opening greeting
   * Default: true
   */
  includeOpening?: boolean;

  /**
   * Whether to include closing
   * Default: true
   */
  includeClosing?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Narrative Generator
 *
 * Converts email clusters, red flags, and summaries into podcast-style
 * briefing scripts optimized for voice delivery.
 *
 * @example
 * ```typescript
 * import { NarrativeGenerator, LLMClient } from '@nexus-aec/intelligence';
 *
 * const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
 * const generator = new NarrativeGenerator({
 *   llmClient,
 *   defaultStyle: 'conversational',
 * });
 *
 * const script = await generator.generateBriefing({
 *   clusters,
 *   redFlagScores,
 *   summaries,
 *   userName: 'John',
 *   currentTime: new Date(),
 * });
 *
 * for (const segment of script.segments) {
 *   console.log(`[${segment.type}] ${segment.content}`);
 * }
 * ```
 */
export class NarrativeGenerator {
  private llmClient: LLMClient;
  private defaultStyle: NarrativeStyle;
  private maxTopics: number;
  private includeOpening: boolean;
  private includeClosing: boolean;
  private debug: boolean;

  constructor(options: NarrativeGeneratorOptions) {
    this.llmClient = options.llmClient;
    this.defaultStyle = options.defaultStyle ?? 'conversational';
    this.maxTopics = options.maxTopics ?? 10;
    this.includeOpening = options.includeOpening ?? true;
    this.includeClosing = options.includeClosing ?? true;
    this.debug = options.debug ?? false;
  }

  /**
   * Generate briefing script from email data
   *
   * @param input - Briefing input data
   * @param options - Generation options
   * @returns Generated briefing script
   */
  async generateBriefing(
    input: BriefingInput,
    options: { style?: NarrativeStyle } = {}
  ): Promise<BriefingScript> {
    const style = options.style ?? this.defaultStyle;
    const startTime = Date.now();

    if (this.debug) {
      console.log(
        `[NarrativeGenerator] Generating briefing: ${input.clusters.length} clusters, ${input.redFlagScores.size} red flags, style: ${style}`
      );
    }

    const segments: ScriptSegment[] = [];
    let totalTokens = 0;
    let redFlagCount = 0;

    // Generate opening
    if (this.includeOpening) {
      const opening = await this.generateOpening(input, style);
      segments.push(opening.segment);
      totalTokens += opening.tokensUsed;
    }

    // Sort clusters by urgency (red flag scores) and size
    const sortedClusters = this.sortClustersByPriority(input);
    const topicClusters = sortedClusters.slice(0, this.maxTopics);

    // Generate topic sections
    for (let i = 0; i < topicClusters.length; i++) {
      const cluster = topicClusters[i];
      if (!cluster) {
        continue;
      }
      // Generate transition (if not first topic)
      if (i > 0) {
        const transition = this.generateTransition(cluster, style);
        segments.push(transition);
      }

      // Generate topic narrative
      const topic = await this.generateTopicNarrative(cluster, input, style);
      segments.push(topic.segment);
      totalTokens += topic.tokensUsed;
      redFlagCount += topic.redFlagCount;
    }

    // Generate closing
    if (this.includeClosing) {
      const closing = await this.generateClosing(input, style, redFlagCount);
      segments.push(closing.segment);
      totalTokens += closing.tokensUsed;
    }

    const generationTimeMs = Date.now() - startTime;
    const totalSeconds = segments.reduce((sum, seg) => sum + seg.estimatedSeconds, 0);

    if (this.debug) {
      console.log(
        `[NarrativeGenerator] Generated ${segments.length} segments in ${generationTimeMs}ms (${totalTokens} tokens, ~${totalSeconds}s reading time)`
      );
    }

    return {
      segments,
      totalSeconds,
      topicCount: topicClusters.filter((c) => !!c).length,
      redFlagCount,
      style,
      generationTimeMs,
      tokensUsed: totalTokens,
    };
  }

  /**
   * Generate opening greeting
   */
  private async generateOpening(
    input: BriefingInput,
    style: NarrativeStyle
  ): Promise<{ segment: ScriptSegment; tokensUsed: number }> {
    const currentTime = input.currentTime ?? new Date();
    const timeOfDay = this.getTimeOfDay(currentTime);
    const userName = input.userName ?? '';
    const clusterCount = input.clusters.length;
    const redFlagCount = Array.from(input.redFlagScores.values()).filter((s) => s.isFlagged).length;

    const systemPrompt = this.getStyleSystemPrompt(style);
    const userPrompt = `Generate a brief opening greeting for an email briefing. Context:
- Time of day: ${timeOfDay}
- User name: ${userName || 'executive'}
- Total topics: ${clusterCount}
- Red flags: ${redFlagCount}

Generate 1-2 sentences that welcome the user and preview what's ahead. Be natural and concise.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.llmClient.complete(messages, {
      temperature: 0.7,
      maxTokens: 150,
    });

    return {
      segment: {
        type: 'opening',
        content: result.content.trim(),
        estimatedSeconds: this.estimateReadingTime(result.content),
      },
      tokensUsed: result.totalTokens,
    };
  }

  /**
   * Generate closing
   */
  private async generateClosing(
    input: BriefingInput,
    style: NarrativeStyle,
    redFlagCount: number
  ): Promise<{ segment: ScriptSegment; tokensUsed: number }> {
    const systemPrompt = this.getStyleSystemPrompt(style);
    const userPrompt = `Generate a brief closing for an email briefing. Context:
- Red flags mentioned: ${redFlagCount}
- Topics covered: ${Math.min(input.clusters.length, this.maxTopics)}

Generate 1-2 sentences that wrap up the briefing and prompt for user interaction. Be natural and concise.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.llmClient.complete(messages, {
      temperature: 0.7,
      maxTokens: 150,
    });

    return {
      segment: {
        type: 'closing',
        content: result.content.trim(),
        estimatedSeconds: this.estimateReadingTime(result.content),
      },
      tokensUsed: result.totalTokens,
    };
  }

  /**
   * Generate narrative for a topic cluster
   */
  private async generateTopicNarrative(
    cluster: TopicCluster,
    input: BriefingInput,
    style: NarrativeStyle
  ): Promise<{ segment: ScriptSegment; tokensUsed: number; redFlagCount: number }> {
    // Collect red flags for this cluster
    const redFlags = cluster.emailIds
      .map((id) => input.redFlagScores.get(id))
      .filter((score): score is RedFlagScore => score?.isFlagged === true);

    // Get summaries for this cluster (prefer thread summaries)
    const summaries = new Set<EmailSummary>();
    for (const threadId of cluster.threadIds) {
      const summary = input.summaries.get(threadId);
      if (summary) {
        summaries.add(summary);
      }
    }
    // Fallback to individual email summaries
    if (summaries.size === 0) {
      for (const emailId of cluster.emailIds) {
        const summary = input.summaries.get(emailId);
        if (summary) {
          summaries.add(summary);
        }
      }
    }

    const systemPrompt = this.getStyleSystemPrompt(style);
    const userPrompt = this.buildTopicPrompt(cluster, Array.from(summaries), redFlags);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await this.llmClient.complete(messages, {
      temperature: 0.7,
      maxTokens: 400,
    });

    return {
      segment: {
        type: 'topic',
        content: result.content.trim(),
        topicId: cluster.id,
        estimatedSeconds: this.estimateReadingTime(result.content),
      },
      tokensUsed: result.totalTokens,
      redFlagCount: redFlags.length,
    };
  }

  /**
   * Build prompt for topic narrative generation
   */
  private buildTopicPrompt(
    cluster: TopicCluster,
    summaries: EmailSummary[],
    redFlags: RedFlagScore[]
  ): string {
    const parts: string[] = [];

    parts.push(`Generate a natural narrative for this email topic:`);
    parts.push(`Topic: ${cluster.topic}`);
    parts.push(`Emails: ${cluster.size}`);
    parts.push('');

    // Add summaries
    if (summaries.length > 0) {
      parts.push('Key points:');
      summaries.slice(0, 3).forEach((summary) => {
        parts.push(`- ${summary.summary}`);
      });
      parts.push('');
    }

    // Add red flag information
    if (redFlags.length > 0) {
      parts.push(`Red flags: ${redFlags.length}`);
      const urgentReasons = redFlags
        .flatMap((flag) => flag.reasons.map((r) => r.description))
        .slice(0, 3);
      if (urgentReasons.length > 0) {
        parts.push('Urgency reasons:');
        urgentReasons.forEach((reason) => {
          parts.push(`- ${reason}`);
        });
      }
      parts.push('');
    }

    parts.push(
      'Generate 2-4 sentences that naturally present this topic, incorporating the key points and urgency signals. Speak directly to the user as if in a conversation.'
    );

    return parts.join('\n');
  }

  /**
   * Generate transition between topics
   */
  private generateTransition(_cluster: TopicCluster, style: NarrativeStyle): ScriptSegment {
    const transitions = this.getTransitionPhrases(style);
    const phrase =
      transitions[Math.floor(Math.random() * transitions.length)] ?? transitions[0] ?? 'Next.';

    return {
      type: 'transition',
      content: phrase,
      estimatedSeconds: this.estimateReadingTime(phrase),
    };
  }

  /**
   * Get transition phrases for style
   */
  private getTransitionPhrases(style: NarrativeStyle): string[] {
    switch (style) {
      case 'formal':
        return [
          'Moving on to the next item.',
          'Next on the agenda.',
          'The following matter requires attention.',
        ];

      case 'conversational':
        return [
          "Let's move on.",
          'Next up.',
          "Here's another topic.",
          'Moving along.',
          'Next item.',
        ];

      case 'executive':
        return ['Next.', 'Moving on.', 'Next item.'];

      case 'concise':
        return ['Next.', 'Also.', 'Additionally.'];

      default:
        return ['Next.'];
    }
  }

  /**
   * Sort clusters by priority (red flags + size)
   */
  private sortClustersByPriority(input: BriefingInput): TopicCluster[] {
    return [...input.clusters].sort((a, b) => {
      // Count red flags in each cluster
      const aFlags = a.emailIds.filter((id) => input.redFlagScores.get(id)?.isFlagged).length;
      const bFlags = b.emailIds.filter((id) => input.redFlagScores.get(id)?.isFlagged).length;

      // Get highest red flag score
      const aMaxScore = Math.max(
        ...a.emailIds.map((id) => input.redFlagScores.get(id)?.score ?? 0),
        0
      );
      const bMaxScore = Math.max(
        ...b.emailIds.map((id) => input.redFlagScores.get(id)?.score ?? 0),
        0
      );

      // Sort by: red flag count (desc), max score (desc), size (desc)
      if (aFlags !== bFlags) {
        return bFlags - aFlags;
      }
      if (aMaxScore !== bMaxScore) {
        return bMaxScore - aMaxScore;
      }
      return b.size - a.size;
    });
  }

  /**
   * Get system prompt for narrative style
   */
  private getStyleSystemPrompt(style: NarrativeStyle): string {
    const basePrompt =
      'You are an executive assistant creating a voice briefing script. Generate natural, spoken language suitable for audio delivery.';

    switch (style) {
      case 'formal':
        return `${basePrompt} Use formal, professional language. Be respectful and precise.`;

      case 'conversational':
        return `${basePrompt} Use warm, conversational language. Sound like a trusted colleague giving a friendly update.`;

      case 'executive':
        return `${basePrompt} Be concise and direct. Use short sentences. Get to the point quickly.`;

      case 'concise':
        return `${basePrompt} Be extremely brief. Use minimal words while conveying essential information.`;

      default:
        return basePrompt;
    }
  }

  /**
   * Estimate reading time in seconds (assumes 150 words per minute)
   */
  private estimateReadingTime(text: string): number {
    const words = text.split(/\s+/).length;
    return Math.ceil((words / 150) * 60);
  }

  /**
   * Get time of day greeting
   */
  private getTimeOfDay(date: Date): string {
    const hour = date.getHours();
    if (hour < 12) {
      return 'morning';
    }
    if (hour < 17) {
      return 'afternoon';
    }
    return 'evening';
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    defaultStyle: NarrativeStyle;
    maxTopics: number;
    includeOpening: boolean;
    includeClosing: boolean;
  } {
    return {
      defaultStyle: this.defaultStyle,
      maxTopics: this.maxTopics,
      includeOpening: this.includeOpening,
      includeClosing: this.includeClosing,
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: {
    defaultStyle?: NarrativeStyle;
    maxTopics?: number;
    includeOpening?: boolean;
    includeClosing?: boolean;
  }): void {
    if (config.defaultStyle !== undefined) {
      this.defaultStyle = config.defaultStyle;
    }
    if (config.maxTopics !== undefined) {
      this.maxTopics = config.maxTopics;
    }
    if (config.includeOpening !== undefined) {
      this.includeOpening = config.includeOpening;
    }
    if (config.includeClosing !== undefined) {
      this.includeClosing = config.includeClosing;
    }
  }
}
