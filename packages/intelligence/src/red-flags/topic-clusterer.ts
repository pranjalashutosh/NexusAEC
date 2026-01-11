import type { StandardEmail, StandardThread } from '@nexus-aec/shared-types';

/**
 * Configuration options for topic clustering
 */
export interface TopicClustererOptions {
  /**
   * Minimum similarity threshold for subject-based clustering (0.0-1.0)
   * Default: 0.5
   */
  similarityThreshold?: number;

  /**
   * Whether to use thread IDs as primary clustering signal
   * Default: true
   */
  useThreadIds?: boolean;

  /**
   * Whether to normalize subjects (remove Re:, Fwd:, etc.)
   * Default: true
   */
  normalizeSubjects?: boolean;

  /**
   * Minimum cluster size to be considered significant
   * Default: 2
   */
  minClusterSize?: number;
}

/**
 * A cluster of related emails/threads
 */
export interface TopicCluster {
  /**
   * Unique cluster ID
   */
  id: string;

  /**
   * Normalized topic/subject
   */
  topic: string;

  /**
   * Email IDs in this cluster
   */
  emailIds: string[];

  /**
   * Thread IDs in this cluster
   */
  threadIds: string[];

  /**
   * Number of emails in cluster
   */
  size: number;

  /**
   * Representative keywords for this topic
   */
  keywords: string[];

  /**
   * Average similarity score within cluster
   */
  coherence: number;
}

/**
 * Result of topic clustering
 */
export interface TopicClusteringResult {
  /**
   * All clusters found
   */
  clusters: TopicCluster[];

  /**
   * Total number of emails processed
   */
  totalEmails: number;

  /**
   * Number of clusters created
   */
  clusterCount: number;

  /**
   * Emails that didn't fit into any cluster
   */
  unclusteredEmailIds: string[];
}

/**
 * Normalize email subject by removing prefixes and extra whitespace
 */
function normalizeSubject(subject: string): string {
  let normalized = subject;

  // Remove common prefixes (case-insensitive, can appear multiple times)
  const prefixes = [/^re:\s*/i, /^fwd?:\s*/i, /^fw:\s*/i, /^\[.*?\]\s*/];

  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of prefixes) {
      const before = normalized;
      normalized = normalized.replace(prefix, '');
      if (before !== normalized) {
        changed = true;
      }
    }
  }

  // Normalize whitespace
  normalized = normalized.trim().replace(/\s+/g, ' ');

  return normalized;
}

/**
 * Extract keywords from text (lowercase, alphanumeric words >= 3 chars)
 */
function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  // Filter out common stop words
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'are',
    'but',
    'not',
    'you',
    'all',
    'can',
    'her',
    'was',
    'one',
    'our',
    'out',
    'day',
    'get',
    'has',
    'him',
    'his',
    'how',
    'its',
    'may',
    'now',
    'see',
    'than',
    'that',
    'this',
    'will',
    'with',
    'from',
  ]);

  return new Set(words.filter((word) => !stopWords.has(word)));
}

/**
 * Calculate Jaccard similarity between two keyword sets
 */
function calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0; // Both empty = identical
  }

  if (set1.size === 0 || set2.size === 0) {
    return 0.0; // One empty, one not = no similarity
  }

  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Generate unique cluster ID
 */
function generateClusterId(index: number): string {
  return `cluster-${index + 1}`;
}

/**
 * TopicClusterer class for clustering emails by topic/project
 *
 * Provides:
 * - Thread ID-based clustering (primary)
 * - Subject normalization
 * - Semantic similarity clustering
 * - Keyword extraction
 *
 * @example
 * ```typescript
 * const clusterer = new TopicClusterer({
 *   similarityThreshold: 0.5,
 *   useThreadIds: true,
 * });
 *
 * const result = clusterer.clusterEmails(emails);
 * console.log(`Found ${result.clusterCount} topic clusters`);
 *
 * result.clusters.forEach(cluster => {
 *   console.log(`Topic: ${cluster.topic}`);
 *   console.log(`Emails: ${cluster.size}`);
 *   console.log(`Keywords: ${cluster.keywords.join(', ')}`);
 * });
 * ```
 */
export class TopicClusterer {
  private options: Required<TopicClustererOptions>;

  constructor(options: TopicClustererOptions = {}) {
    this.options = {
      similarityThreshold: options.similarityThreshold ?? 0.5,
      useThreadIds: options.useThreadIds ?? true,
      normalizeSubjects: options.normalizeSubjects ?? true,
      minClusterSize: options.minClusterSize ?? 2,
    };
  }

  /**
   * Cluster emails by topic
   */
  clusterEmails(emails: StandardEmail[]): TopicClusteringResult {
    if (emails.length === 0) {
      return {
        clusters: [],
        totalEmails: 0,
        clusterCount: 0,
        unclusteredEmailIds: [],
      };
    }

    const emailMap = new Map<string, StandardEmail>();
    emails.forEach((email) => emailMap.set(email.id, email));

    const clusters: Map<string, Set<string>> = new Map();
    const processedEmails = new Set<string>();

    // Step 1: Thread-based clustering (if enabled)
    if (this.options.useThreadIds) {
      const threadGroups = new Map<string, Set<string>>();

      for (const email of emails) {
        if (email.threadId) {
          if (!threadGroups.has(email.threadId)) {
            threadGroups.set(email.threadId, new Set());
          }
          threadGroups.get(email.threadId)?.add(email.id);
        }
      }

      // Convert thread groups to clusters
      for (const [threadId, emailIds] of threadGroups.entries()) {
        if (emailIds.size >= this.options.minClusterSize) {
          clusters.set(`thread-${threadId}`, emailIds);
          emailIds.forEach((id) => processedEmails.add(id));
        }
      }
    }

    // Step 2: Subject-based clustering for remaining emails
    const remainingEmails = emails.filter((email) => !processedEmails.has(email.id));

    if (remainingEmails.length > 0) {
      // Group by normalized subject
      const subjectGroups = new Map<string, Set<string>>();

      for (const email of remainingEmails) {
        const normalized = this.options.normalizeSubjects
          ? normalizeSubject(email.subject)
          : email.subject;

        if (!subjectGroups.has(normalized)) {
          subjectGroups.set(normalized, new Set());
        }
        subjectGroups.get(normalized)?.add(email.id);
      }

      // Merge similar subject groups
      const subjectList = Array.from(subjectGroups.keys());
      const merged = new Set<string>();

      for (let i = 0; i < subjectList.length; i++) {
        const subject1 = subjectList[i];
        if (!subject1 || merged.has(subject1)) {
          continue;
        }

        const keywords1 = extractKeywords(subject1);
        const group1 = subjectGroups.get(subject1);
        if (!group1) {
          continue;
        }

        // Find similar subjects and merge
        for (let j = i + 1; j < subjectList.length; j++) {
          const subject2 = subjectList[j];
          if (!subject2 || merged.has(subject2)) {
            continue;
          }

          const keywords2 = extractKeywords(subject2);
          const similarity = calculateSimilarity(keywords1, keywords2);

          if (similarity >= this.options.similarityThreshold) {
            const group2 = subjectGroups.get(subject2);
            if (group2) {
              group2.forEach((id) => group1.add(id));
              merged.add(subject2);
            }
          }
        }

        // Add to clusters if meets minimum size
        if (group1.size >= this.options.minClusterSize) {
          clusters.set(`subject-${subject1}`, group1);
          group1.forEach((id) => processedEmails.add(id));
        }
      }
    }

    // Step 3: Build final cluster results
    const finalClusters: TopicCluster[] = [];
    let clusterIndex = 0;

    for (const [_key, emailIds] of clusters.entries()) {
      const emailList = Array.from(emailIds)
        .map((id) => emailMap.get(id))
        .filter((e): e is StandardEmail => e !== undefined);

      if (emailList.length === 0) {
        continue;
      }

      // Extract topic from first email
      const firstEmail = emailList[0];
      if (!firstEmail) {
        continue;
      }

      const topic = this.options.normalizeSubjects
        ? normalizeSubject(firstEmail.subject)
        : firstEmail.subject;

      // Extract all keywords from cluster
      const allKeywords = new Set<string>();
      emailList.forEach((email) => {
        const text = `${email.subject} ${email.body ?? email.snippet ?? ''}`;
        const keywords = extractKeywords(text);
        keywords.forEach((kw) => allKeywords.add(kw));
      });

      // Get top keywords (by frequency)
      const keywordFreq = new Map<string, number>();
      emailList.forEach((email) => {
        const text = `${email.subject} ${email.body ?? email.snippet ?? ''}`;
        const keywords = extractKeywords(text);
        keywords.forEach((kw) => {
          keywordFreq.set(kw, (keywordFreq.get(kw) ?? 0) + 1);
        });
      });

      const topKeywords = Array.from(keywordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([kw]) => kw);

      // Calculate cluster coherence (average pairwise similarity)
      let totalSimilarity = 0;
      let pairCount = 0;

      for (let i = 0; i < emailList.length; i++) {
        for (let j = i + 1; j < emailList.length; j++) {
          const email1 = emailList[i];
          const email2 = emailList[j];
          if (!email1 || !email2) {
            continue;
          }

          const kw1 = extractKeywords(`${email1.subject} ${email1.body ?? email1.snippet ?? ''}`);
          const kw2 = extractKeywords(`${email2.subject} ${email2.body ?? email2.snippet ?? ''}`);

          totalSimilarity += calculateSimilarity(kw1, kw2);
          pairCount++;
        }
      }

      const coherence = pairCount > 0 ? totalSimilarity / pairCount : 1.0;

      // Extract unique thread IDs
      const threadIds = Array.from(
        new Set(emailList.map((e) => e.threadId).filter((id): id is string => id !== undefined))
      );

      finalClusters.push({
        id: generateClusterId(clusterIndex++),
        topic,
        emailIds: Array.from(emailIds),
        threadIds,
        size: emailIds.size,
        keywords: topKeywords,
        coherence: Math.round(coherence * 100) / 100,
      });
    }

    // Sort clusters by size (descending)
    finalClusters.sort((a, b) => b.size - a.size);

    // Find unclustered emails
    const unclusteredEmailIds = emails
      .filter((email) => !processedEmails.has(email.id))
      .map((email) => email.id);

    return {
      clusters: finalClusters,
      totalEmails: emails.length,
      clusterCount: finalClusters.length,
      unclusteredEmailIds,
    };
  }

  /**
   * Cluster threads by topic
   */
  clusterThreads(threads: StandardThread[]): TopicClusteringResult {
    // Flatten threads to emails for clustering
    const allEmails = threads.flatMap((thread) => thread.messages);
    return this.clusterEmails(allEmails);
  }

  /**
   * Get cluster for a specific email
   */
  getClusterForEmail(emailId: string, result: TopicClusteringResult): TopicCluster | null {
    for (const cluster of result.clusters) {
      if (cluster.emailIds.includes(emailId)) {
        return cluster;
      }
    }
    return null;
  }

  /**
   * Get detection options
   */
  getOptions(): Required<TopicClustererOptions> {
    return { ...this.options };
  }

  /**
   * Update detection options
   */
  updateOptions(options: Partial<TopicClustererOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }
}
