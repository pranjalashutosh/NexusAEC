/**
 * @nexus-aec/intelligence
 *
 * Intelligence layer for NexusAEC voice executive assistant
 * Provides red flag detection, email clustering, and pattern matching
 */

// Export types
export {
  Severity,
  RedFlagCategory,
  PatternType,
  type ContextField,
  type RedFlagPattern,
  type PatternMatch,
} from './types';

// Export default patterns and utilities
export {
  DEFAULT_RED_FLAG_PATTERNS,
  getPatternsByCategory,
  getPatternsBySeverity,
  getPatternsForField,
  getPatternById,
} from './red-flags/default-patterns';

// Export keyword matcher
export {
  KeywordMatcher,
  type KeywordMatcherOptions,
  type KeywordMatchResult,
} from './red-flags/keyword-matcher';

// Export VIP detector
export {
  VipDetector,
  type VipDetectorOptions,
  type VipDetectionResult,
  type VipReason,
} from './red-flags/vip-detector';

// Export thread velocity detector
export {
  ThreadVelocityDetector,
  type ThreadVelocityOptions,
  type ThreadVelocityResult,
  type VelocityReason,
} from './red-flags/thread-velocity';

// Export calendar proximity detector
export {
  CalendarProximityDetector,
  type CalendarProximityOptions,
  type CalendarProximityResult,
  type RelevantEvent,
  type ProximityReason,
} from './red-flags/calendar-proximity';

// Export Red Flag scorer
export {
  RedFlagScorer,
  type RedFlagScorerOptions,
  type RedFlagSignals,
  type RedFlagScore,
  type SignalContribution,
  type ScoringReason,
} from './red-flags/scorer';

// Export topic clusterer
export {
  TopicClusterer,
  type TopicClustererOptions,
  type TopicCluster,
  type TopicClusteringResult,
} from './red-flags/topic-clusterer';

// Export session state (Tier 2)
export {
  InterruptStatus,
  type DriveState,
  type BriefingPosition,
  type UserAction,
  type CreateDriveStateOptions,
  type UpdateDriveStateOptions,
  createInitialDriveState,
  updateDriveState,
  navigateToNextItem,
  navigateToPreviousItem,
  skipCurrentTopic,
  goDeeper,
  isBriefingComplete,
  getProgressPercentage,
  validateDriveState,
} from './session/drive-state';

// Export Redis session store
export {
  RedisSessionStore,
  type RedisSessionStoreOptions,
  type SessionMetadata,
} from './session/redis-session-store';

// Export shadow processor
export {
  ShadowProcessor,
  type ShadowProcessorOptions,
  type TranscriptEvent,
  type CommandIntent,
  type StateChangeHandler,
  type CommandDetectedHandler,
  type ErrorHandler,
} from './session/shadow-processor';

// Export Supabase vector store (Tier 3)
export {
  SupabaseVectorStore,
  type SupabaseVectorStoreOptions,
  type VectorDocument,
  type VectorDocumentInsert,
  type VectorSearchResult,
  type VectorSearchOptions,
  type SourceType,
} from './knowledge/supabase-vector-store';

// Export asset types
export {
  type Asset,
  type AssetCriticality,
  type AssetCategory,
  type AssetStatus,
  type AssetDocument,
  type SafetyDocument,
  type SafetyDocumentDocument,
  type IngestionSource,
  type AssetQueryOptions,
  type AssetSearchResult,
  validateAsset,
  validateSafetyDocument,
  assetToContent,
  safetyDocumentToContent,
  normalizeAssetCategory,
} from './knowledge/asset-types';

// Export CSV parser
export {
  parseAssetCSV,
  parseAssetCSVString,
  detectDelimiter,
  type CSVParseResult,
  type CSVParseOptions,
} from './knowledge/csv-parser';

// Export PDF extractor
export {
  extractPDF,
  extractPDFFromBuffer,
  extractPages,
  getPDFMetadata,
  isValidPDF,
  splitIntoSections,
  extractTableOfContents,
  type PDFExtractionResult,
  type PDFExtractionOptions,
} from './knowledge/pdf-extractor';

// Export asset ingestion
export {
  AssetIngestion,
  type EmbeddingGenerator,
  type AssetIngestionOptions,
  type IngestionProgress,
  type IngestionResult,
} from './knowledge/asset-ingestion';

// Export RAG retriever
export {
  RAGRetriever,
  type RAGQueryOptions,
  type RAGResult,
  type RetrievalStats,
  type RAGRetrieverOptions,
} from './knowledge/rag-retriever';

// Export LLM client
export {
  LLMClient,
  type LLMMessage,
  type MessageRole,
  type LLMCompletionOptions,
  type LLMCompletionResult,
  type StreamChunkCallback,
  type RateLimiterOptions,
  type RetryOptions,
  type LLMClientOptions,
} from './knowledge/llm-client';

// Export Email summarizer
export {
  EmailSummarizer,
  type SummarizationMode,
  type EmailSummary,
  type EmailSummarizerOptions,
} from './knowledge/email-summarizer';

// Export Narrative generator
export {
  NarrativeGenerator,
  type NarrativeStyle,
  type ScriptSection,
  type ScriptSegment,
  type BriefingScript,
  type BriefingInput,
  type NarrativeGeneratorOptions,
} from './knowledge/narrative-generator';

// Export Explanation generator
export {
  ExplanationGenerator,
  type ExplanationStyle,
  type RedFlagExplanation,
  type ExplanationGeneratorOptions,
} from './knowledge/explanation-generator';

// Export Preferences store
export {
  PreferencesStore,
  type VipContact,
  type CustomKeyword,
  type TopicPreference,
  type MutedSender,
  type UserPreferences,
  type PreferencesStoreOptions,
  type ConflictResolution,
} from './knowledge/preferences-store';

// Export Feedback learner
export {
  FeedbackLearner,
  type FeedbackType,
  type FeedbackRecord,
  type WeightAdjustments,
  type LearningStats,
  type FeedbackLearnerOptions,
} from './knowledge/feedback-learner';
