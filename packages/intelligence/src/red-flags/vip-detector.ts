import type { StandardEmail, VIP, Contact } from '@nexus-aec/shared-types';

/**
 * Configuration options for VIP detection
 */
export interface VipDetectorOptions {
  /**
   * Weight for explicit VIP matches (0.0-1.0)
   * Default: 0.8
   */
  vipMatchWeight?: number;

  /**
   * Threshold for high interaction frequency (number of interactions)
   * Default: 50
   */
  highInteractionThreshold?: number;

  /**
   * Threshold for medium interaction frequency (number of interactions)
   * Default: 20
   */
  mediumInteractionThreshold?: number;

  /**
   * Weight for high interaction frequency (0.0-1.0)
   * Default: 0.6
   */
  highInteractionWeight?: number;

  /**
   * Weight for medium interaction frequency (0.0-1.0)
   * Default: 0.4
   */
  mediumInteractionWeight?: number;

  /**
   * Recency boost factor (days)
   * Recent interactions (within this many days) get importance boost
   * Default: 7
   */
  recencyBoostDays?: number;

  /**
   * Recency boost multiplier (0.0-1.0)
   * Default: 0.2
   */
  recencyBoostMultiplier?: number;
}

/**
 * Result of VIP detection
 */
export interface VipDetectionResult {
  /**
   * Whether sender is a VIP
   */
  isVip: boolean;

  /**
   * VIP importance score (0.0-1.0)
   */
  score: number;

  /**
   * Matched VIP entry (if any)
   */
  vipEntry?: VIP;

  /**
   * Contact information (if available)
   */
  contact?: Contact;

  /**
   * Reasons for VIP detection
   */
  reasons: VipReason[];
}

/**
 * Reason for VIP detection
 */
export interface VipReason {
  /**
   * Type of VIP reason
   */
  type:
    | 'explicit_vip'
    | 'high_interaction'
    | 'medium_interaction'
    | 'recent_interaction'
    | 'job_title';

  /**
   * Description of the reason
   */
  description: string;

  /**
   * Weight contribution (0.0-1.0)
   */
  weight: number;
}

/**
 * Normalize email address for comparison (lowercase, trim)
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Check if email matches VIP list
 */
function findVipMatch(email: string, vipList: VIP[]): VIP | undefined {
  const normalized = normalizeEmail(email);
  return vipList.find((vip) => normalizeEmail(vip.email) === normalized);
}

/**
 * Find contact by email
 */
function findContact(email: string, contacts: Contact[]): Contact | undefined {
  const normalized = normalizeEmail(email);
  return contacts.find((contact) => normalizeEmail(contact.email) === normalized);
}

/**
 * Calculate days since last interaction
 */
function daysSinceInteraction(lastInteractionAt?: Date): number {
  if (!lastInteractionAt) {
    return Infinity;
  }
  const now = new Date();
  const diffMs = now.getTime() - lastInteractionAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if job title indicates VIP status
 */
function hasVipJobTitle(jobTitle?: string): boolean {
  if (!jobTitle) {
    return false;
  }

  const vipTitles = [
    'ceo',
    'cto',
    'cfo',
    'coo',
    'president',
    'vice president',
    'vp',
    'director',
    'head of',
    'chief',
    'founder',
    'co-founder',
    'partner',
    'principal',
  ];

  const normalized = jobTitle.toLowerCase();
  return vipTitles.some((title) => normalized.includes(title));
}

/**
 * VipDetector class for detecting VIP senders and inferring importance
 *
 * Provides:
 * - Explicit VIP list matching
 * - Interaction frequency analysis
 * - Recency-based importance boosting
 * - Job title-based VIP detection
 *
 * @example
 * ```typescript
 * const detector = new VipDetector({
 *   vipList: userVips,
 *   contacts: userContacts,
 * });
 *
 * const result = detector.detectVip(email);
 * if (result.isVip) {
 *   console.log(`VIP detected with score: ${result.score}`);
 *   result.reasons.forEach(reason => {
 *     console.log(`- ${reason.description} (weight: ${reason.weight})`);
 *   });
 * }
 * ```
 */
export class VipDetector {
  private options: Required<VipDetectorOptions>;
  private vipList: VIP[];
  private contacts: Contact[];

  constructor(
    config: {
      vipList?: VIP[];
      contacts?: Contact[];
    } = {},
    options: VipDetectorOptions = {}
  ) {
    this.vipList = config.vipList ?? [];
    this.contacts = config.contacts ?? [];

    this.options = {
      vipMatchWeight: options.vipMatchWeight ?? 0.8,
      highInteractionThreshold: options.highInteractionThreshold ?? 50,
      mediumInteractionThreshold: options.mediumInteractionThreshold ?? 20,
      highInteractionWeight: options.highInteractionWeight ?? 0.6,
      mediumInteractionWeight: options.mediumInteractionWeight ?? 0.4,
      recencyBoostDays: options.recencyBoostDays ?? 7,
      recencyBoostMultiplier: options.recencyBoostMultiplier ?? 0.2,
    };
  }

  /**
   * Detect VIP status for an email sender
   */
  detectVip(email: StandardEmail): VipDetectionResult {
    const senderEmail = email.from.email;
    const reasons: VipReason[] = [];
    let score = 0;

    // Check explicit VIP list
    const vipEntry = findVipMatch(senderEmail, this.vipList);
    if (vipEntry) {
      score += this.options.vipMatchWeight;
      reasons.push({
        type: 'explicit_vip',
        description: `Sender is in VIP list: ${vipEntry.name ?? vipEntry.email}`,
        weight: this.options.vipMatchWeight,
      });
    }

    // Check contact information for interaction frequency
    const contact = findContact(senderEmail, this.contacts);
    if (contact) {
      const interactionCount = contact.interactionCount ?? 0;

      // High interaction frequency
      if (interactionCount >= this.options.highInteractionThreshold) {
        score += this.options.highInteractionWeight;
        reasons.push({
          type: 'high_interaction',
          description: `High interaction frequency: ${interactionCount} interactions`,
          weight: this.options.highInteractionWeight,
        });
      }
      // Medium interaction frequency
      else if (interactionCount >= this.options.mediumInteractionThreshold) {
        score += this.options.mediumInteractionWeight;
        reasons.push({
          type: 'medium_interaction',
          description: `Medium interaction frequency: ${interactionCount} interactions`,
          weight: this.options.mediumInteractionWeight,
        });
      }

      // Recency boost
      const daysSince = daysSinceInteraction(contact.lastInteractionAt);
      if (daysSince <= this.options.recencyBoostDays) {
        const boost = this.options.recencyBoostMultiplier;
        score += boost;
        reasons.push({
          type: 'recent_interaction',
          description: `Recent interaction (${daysSince} days ago)`,
          weight: boost,
        });
      }

      // Job title check
      if (hasVipJobTitle(contact.jobTitle)) {
        const titleWeight = 0.3;
        score += titleWeight;
        reasons.push({
          type: 'job_title',
          description: `VIP job title: ${contact.jobTitle}`,
          weight: titleWeight,
        });
      }
    }

    // Cap score at 1.0
    score = Math.min(score, 1.0);

    const result: VipDetectionResult = {
      isVip: score >= 0.5, // Threshold for VIP status
      score,
      reasons,
    };

    if (vipEntry) {
      result.vipEntry = vipEntry;
    }

    if (contact) {
      result.contact = contact;
    }

    return result;
  }

  /**
   * Batch detect VIPs for multiple emails
   */
  detectVips(emails: StandardEmail[]): Map<string, VipDetectionResult> {
    const results = new Map<string, VipDetectionResult>();

    for (const email of emails) {
      const result = this.detectVip(email);
      results.set(email.id, result);
    }

    return results;
  }

  /**
   * Get VIP list
   */
  getVipList(): VIP[] {
    return [...this.vipList];
  }

  /**
   * Set VIP list
   */
  setVipList(vipList: VIP[]): void {
    this.vipList = vipList;
  }

  /**
   * Add VIP to list
   */
  addVip(vip: VIP): void {
    // Check if already exists
    const existing = findVipMatch(vip.email, this.vipList);
    if (!existing) {
      this.vipList.push(vip);
    }
  }

  /**
   * Remove VIP from list
   */
  removeVip(email: string): boolean {
    const normalized = normalizeEmail(email);
    const index = this.vipList.findIndex((vip) => normalizeEmail(vip.email) === normalized);

    if (index !== -1) {
      this.vipList.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Get contacts
   */
  getContacts(): Contact[] {
    return [...this.contacts];
  }

  /**
   * Set contacts
   */
  setContacts(contacts: Contact[]): void {
    this.contacts = contacts;
  }

  /**
   * Add or update contact
   */
  addOrUpdateContact(contact: Contact): void {
    const existing = findContact(contact.email, this.contacts);
    if (existing) {
      // Update existing
      Object.assign(existing, contact);
    } else {
      // Add new
      this.contacts.push(contact);
    }
  }

  /**
   * Get detection options
   */
  getOptions(): Required<VipDetectorOptions> {
    return { ...this.options };
  }

  /**
   * Update detection options
   */
  updateOptions(options: Partial<VipDetectorOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }
}
