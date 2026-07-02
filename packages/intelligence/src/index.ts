/**
 * @nexus-aec/intelligence
 *
 * Intelligence layer for NexusAEC voice executive assistant
 * Provides LLM-powered email preprocessing, knowledge base, personalization,
 * and session state management.
 */

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

// Export Sender profile store
export {
  SenderProfileStore,
  type SenderProfile,
  type SenderProfileStoreOptions,
  type ProfileAction,
} from './knowledge/sender-profile-store';

// Export Email preprocessor
export {
  preprocessEmails,
  preprocessBatch,
  presortEmails,
  type PreprocessedEmail,
  type BatchResult,
  type PreprocessingResult,
  type EmailMetadata,
  type PreprocessOptions,
} from './preprocessing/email-preprocessor';
