# @nexus-aec/intelligence

Intelligence layer for the NexusAEC Voice-Driven AI Executive Assistant.

This package provides three tiers of intelligence:

- **Tier 1**: Red flag detection and email analysis
- **Tier 2**: Session management and voice interaction
- **Tier 3**: Knowledge base with RAG (Retrieval Augmented Generation)

## Features

### Tier 1: Red Flag Detection

- **Keyword Matching**: Pattern-based detection with fuzzy matching
- **VIP Detection**: Identify important contacts by title, role, or interaction
  frequency
- **Thread Velocity**: Detect rapid email exchanges indicating urgency
- **Calendar Proximity**: Flag emails related to upcoming meetings
- **Topic Clustering**: Group related emails by semantic similarity
- **Composite Scoring**: Combine multiple signals for accurate prioritization

### Tier 2: Session Management

- **Drive State**: Manage briefing sessions with navigation and progress
  tracking
- **Redis Session Store**: Persistent session storage with TTL management
- **Shadow Processor**: Real-time voice command detection and state management

### Tier 3: Knowledge Base (RAG)

- **Vector Store**: Supabase pgvector integration for semantic search
- **Asset Management**: Store and retrieve asset data with metadata
- **Safety Documents**: Manage safety manuals, procedures, and policies
- **CSV/JSON Ingestion**: Import assets from various formats
- **PDF Extraction**: Extract text from PDF safety manuals
- **Semantic Search**: Find relevant information by meaning, not just keywords
- **CLI Tools**: Command-line utilities for data management

## Installation

```bash
pnpm install
```

## Environment Variables

Create a `.env` file in the `packages/intelligence` directory:

```bash
# OpenAI API Key (for embeddings)
OPENAI_API_KEY=sk-...

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...

# Redis Configuration (optional, for Tier 2)
# REDIS_URL=redis://localhost:6379
```

See `.env.example` for a template.

## Database Setup

The knowledge base requires Supabase with pgvector:

```bash
cd supabase
supabase db push
```

This creates:

- `documents` table for vector storage
- `match_documents` function for similarity search

## CSV Format for Asset Data

### Required Columns

Assets must include these fields:

- **AssetID** (or variants: `assetId`, `asset_id`, `id`, `Asset No`, etc.)
- **Name** (or variants: `Asset Name`, `asset_name`, `title`, etc.)
- **Description** (or variants: `desc`, `details`, `notes`)
- **Category** (or variants: `type`, `Asset Type`, `class`)
- **Location** (or variants: `site`, `facility`, `place`, `address`)

### Optional Columns

- **Criticality**: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`
- **Status**: `OPERATIONAL`, `MAINTENANCE`, `OFFLINE`, `DECOMMISSIONED`
- **Manufacturer**: Equipment manufacturer
- **Model**: Model number
- **Serial Number**: Serial number
- **Install Date**: Installation date (ISO 8601 format)
- **Last Maintenance**: Last maintenance date
- **Next Maintenance**: Scheduled next maintenance
- **Department**: Responsible department
- **Responsible**: Responsible person/team

Any additional columns are automatically stored as metadata.

### Example CSV

```csv
AssetID,Name,Description,Category,Location,Criticality,Status,Manufacturer,Model
P-104,Pump Station 104,Main water distribution pump,PUMP,Riverside Bridge Station,CRITICAL,OPERATIONAL,FlowTech Industries,FT-5000
V-201,Valve Assembly 201,Main pressure regulation valve,VALVE,North Plant,MEDIUM,OPERATIONAL,ValveTech Solutions,VTS-24-BF
```

### Column Name Flexibility

The CSV parser recognizes various column naming conventions (case-insensitive):

| Standard Field | Accepted Aliases                                                               |
| -------------- | ------------------------------------------------------------------------------ |
| assetId        | `assetid`, `asset_id`, `id`, `asset id`, `assetno`, `asset no`, `asset number` |
| name           | `name`, `asset name`, `asset_name`, `assetname`, `title`                       |
| description    | `description`, `desc`, `details`, `notes`                                      |
| category       | `category`, `type`, `asset type`, `asset_type`, `assettype`, `class`           |
| location       | `location`, `site`, `facility`, `place`, `address`                             |
| criticality    | `criticality`, `priority`, `importance`, `critical`                            |
| status         | `status`, `state`, `condition`, `operational status`                           |

### Category Normalization

Categories are automatically normalized:

- Lowercase → UPPERCASE
- Spaces/hyphens → underscores
- Example: `"control panel"` → `"CONTROL_PANEL"`

Standard categories:

- `PUMP`, `VALVE`, `GENERATOR`, `TANK`, `MOTOR`, `SENSOR`
- `CONTROL_PANEL`, `PIPE`, `HVAC`, `ELECTRICAL`, `MECHANICAL`
- `INSTRUMENTATION`, `OTHER`

Custom categories are preserved if they don't match standard values.

### Metadata Extraction

Any columns not matching core fields are automatically extracted as metadata
with camelCase keys:

| CSV Column         | Metadata Key      |
| ------------------ | ----------------- |
| `Install Date`     | `installDate`     |
| `Last Maintenance` | `lastMaintenance` |
| `Power Rating`     | `powerRating`     |
| `Serial Number`    | `serialNumber`    |

## CLI Tools

### Ingest Assets

Import assets from CSV or JSON files:

```bash
# From CSV
pnpm tsx cli/ingest-assets.ts --file ./data/assets.csv

# From JSON with options
pnpm tsx cli/ingest-assets.ts \
  --file ./data/seed-assets.json \
  --clear \
  --batch-size 20

# Using npm script
pnpm run ingest:assets -- -f ./data/assets.csv
```

**Options:**

- `-f, --file <path>` - Path to CSV or JSON file (required)
- `-c, --clear` - Clear existing assets before ingestion
- `-b, --batch-size <number>` - Batch size for processing (default: 10)
- `--skip-validation` - Skip asset validation
- `--max-concurrency <number>` - Max concurrent embedding requests (default: 5)
- `--embedding-model <model>` - OpenAI model (default: text-embedding-3-small)

### Ingest Safety Manuals

Import safety manuals from JSON or PDF files:

```bash
# From JSON
pnpm tsx cli/ingest-manuals.ts --file ./data/seed-safety-manuals.json

# From PDF
pnpm tsx cli/ingest-manuals.ts pdf \
  --file ./manuals/loto-procedure.pdf \
  --id PROC-001 \
  --title "Lockout/Tagout Procedure" \
  --type PROCEDURE \
  --assets "P-104,P-105,M-501"

# Using npm script
pnpm run ingest:manuals -- -f ./data/manuals.json
```

**Document Types:**

- `SAFETY_MANUAL` - Safety manuals and handbooks
- `PROCEDURE` - Operating procedures and work instructions
- `POLICY` - Safety policies and guidelines
- `GUIDELINE` - Best practices and recommendations

### List Assets

Browse and search the knowledge base:

```bash
# List all items
pnpm tsx cli/list-assets.ts

# List only assets
pnpm tsx cli/list-assets.ts --type asset --limit 10

# Get counts
pnpm tsx cli/list-assets.ts --count

# Semantic search
pnpm tsx cli/list-assets.ts --search "pump station maintenance"

# Using npm script
pnpm run list:assets -- --type manual
```

**Options:**

- `-t, --type <type>` - Filter by type: asset, manual, or all (default: all)
- `-l, --limit <number>` - Maximum items to display (default: 20)
- `-o, --offset <number>` - Items to skip for pagination (default: 0)
- `-s, --search <query>` - Semantic search query
- `-c, --count` - Only display counts
- `--similarity <threshold>` - Min similarity for search (default: 0.7)

### Validate Data

Validate seed data before ingestion:

```bash
# Validate assets
pnpm run validate:assets

# Validate safety manuals
pnpm run validate:manuals
```

## Usage Examples

### Tier 1: Red Flag Detection

```typescript
import {
  KeywordMatcher,
  VipDetector,
  RedFlagScorer,
} from '@nexus-aec/intelligence';

// Keyword matching
const matcher = new KeywordMatcher();
const result = matcher.matchEmail({
  subject: 'URGENT: Production system down',
  body: 'We need immediate action...',
  sender: 'cto@example.com',
});

// VIP detection
const vipDetector = new VipDetector({
  vipList: ['ceo@example.com', 'cto@example.com'],
});
const vipResult = vipDetector.detectVip({
  from: 'cto@example.com',
  contact: { jobTitle: 'CTO' },
});

// Composite scoring
const scorer = new RedFlagScorer();
const score = scorer.score({
  keywordSignals: result,
  vipSignals: vipResult,
});
```

### Tier 2: Session Management

```typescript
import { createInitialDriveState, updateDriveState } from '@nexus-aec/intelligence';

// Create briefing session
const state = createInitialDriveState({
  userId: 'user-123',
  topics: [
    { name: 'Critical Alerts', items: [...] },
    { name: 'Today\'s Schedule', items: [...] }
  ]
});

// Navigate briefing
const nextState = updateDriveState(state, { type: 'NEXT' });
```

### Tier 3: Knowledge Base

```typescript
import {
  SupabaseVectorStore,
  AssetIngestion,
  parseAssetCSV,
} from '@nexus-aec/intelligence';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

// Initialize vector store
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const vectorStore = new SupabaseVectorStore(supabase);

// Parse CSV
const result = parseAssetCSV('./assets.csv');
console.log(`Parsed ${result.assets.length} assets`);

// Generate embeddings and ingest
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const embedder = async (text: string) => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
};

const ingestion = new AssetIngestion(vectorStore, embedder);
await ingestion.ingestAssetsFromJSON('./seed-assets.json');

// Search knowledge base
const queryEmbedding = await embedder('pump maintenance procedures');
const results = await vectorStore.search(queryEmbedding, {
  sourceType: 'safety_manual',
  limit: 5,
  similarityThreshold: 0.7,
});
```

### Tier 3: RAG Retrieval

The `RAGRetriever` provides a high-level interface for semantic search in
Retrieval Augmented Generation (RAG) workflows. It handles query embedding
generation and returns typed results.

```typescript
import {
  RAGRetriever,
  SupabaseVectorStore,
  type Asset,
  type SafetyDocument,
} from '@nexus-aec/intelligence';
import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';

// Initialize vector store
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const vectorStore = new SupabaseVectorStore(supabase);

// Create embedding generator
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const embeddingGenerator = async (text: string) => {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
};

// Initialize RAG retriever
const retriever = new RAGRetriever({
  vectorStore,
  embeddingGenerator,
  defaultTopK: 5,
  defaultMinSimilarity: 0.7,
});

// Search for assets
const assetResults = await retriever.retrieveAssets(
  'pump station maintenance procedures',
  { topK: 5 }
);

assetResults.forEach((result) => {
  const asset = result.data as Asset;
  console.log(`Asset: ${asset.name} (${asset.assetId})`);
  console.log(`Score: ${result.score.toFixed(3)}`);
  console.log(`Location: ${asset.location}`);
});

// Search for safety documents
const safetyResults = await retriever.retrieveSafetyDocuments(
  'lockout tagout procedure',
  { topK: 3, minSimilarity: 0.8 }
);

safetyResults.forEach((result) => {
  const doc = result.data as SafetyDocument;
  console.log(`Document: ${doc.title} (${doc.id})`);
  console.log(`Score: ${result.score.toFixed(3)}`);
  console.log(`Type: ${doc.type}`);
});

// Search all documents with statistics
const { results, stats } = await retriever.retrieveWithStats(
  'emergency shutdown procedure'
);

console.log(`Found ${stats.resultCount} results in ${stats.queryTimeMs}ms`);
console.log(`Average similarity: ${stats.averageScore.toFixed(3)}`);

// Filter by metadata
const criticalPumps = await retriever.retrieveAssets('water distribution', {
  topK: 10,
  metadataFilter: {
    category: 'PUMP',
    criticality: 'CRITICAL',
  },
});
```

### Tier 3: LLM Client

The `LLMClient` provides GPT-4o API integration with retry logic, rate limiting,
and streaming support for email summarization and narrative generation.

```typescript
import { LLMClient, type LLMMessage } from '@nexus-aec/intelligence';

// Initialize LLM client
const llmClient = new LLMClient({
  apiKey: process.env.OPENAI_API_KEY!,
  defaultModel: 'gpt-4o',
  defaultTemperature: 0.7,
  defaultMaxTokens: 1000,
  rateLimiter: {
    requestsPerMinute: 60,
    tokensPerMinute: 90000,
  },
  retry: {
    maxRetries: 3,
    initialRetryDelay: 1000,
    backoffMultiplier: 2,
  },
});

// Generate completion
const messages: LLMMessage[] = [
  { role: 'system', content: 'You are a helpful executive assistant.' },
  { role: 'user', content: 'Summarize the following email thread...' },
];

const result = await llmClient.complete(messages, {
  temperature: 0.5,
  maxTokens: 500,
});

console.log(`Generated: ${result.content}`);
console.log(`Tokens used: ${result.totalTokens}`);
console.log(`Response time: ${result.responseTimeMs}ms`);

// Stream completion
await llmClient.streamComplete(
  [
    { role: 'system', content: 'You are a podcast narrator.' },
    { role: 'user', content: 'Create a briefing script...' },
  ],
  (chunk) => {
    process.stdout.write(chunk);
  },
  { temperature: 0.8, maxTokens: 2000 }
);

// Configure client
llmClient.setConfig({
  defaultModel: 'gpt-4o-mini',
  defaultTemperature: 0.3,
});

const config = llmClient.getConfig();
console.log(`Model: ${config.defaultModel}`);
console.log(`Has rate limiter: ${config.hasRateLimiter}`);
```

### Tier 3: Email Summarization

The `EmailSummarizer` generates concise summaries of email threads using GPT-4o.
Supports multiple summarization modes for different use cases.

```typescript
import { EmailSummarizer, LLMClient } from '@nexus-aec/intelligence';

// Initialize LLM client
const llmClient = new LLMClient({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Initialize summarizer
const summarizer = new EmailSummarizer({
  llmClient,
  defaultMode: 'brief',
  maxMessagesInContext: 20,
  includeMetadata: true,
});

// Summarize email thread in brief mode
const briefSummary = await summarizer.summarizeThread(thread, {
  mode: 'brief',
});

console.log(briefSummary.summary);
// "Project is on track, milestone 1 completed, moving to milestone 2."

// Extract action items from thread
const actionSummary = await summarizer.summarizeThread(thread, {
  mode: 'action-items',
});

console.log('Action Items:');
actionSummary.actionItems?.forEach((item) => {
  console.log(`- ${item.action}`);
  if (item.assignee) console.log(`  Assignee: ${item.assignee}`);
  if (item.dueDate) console.log(`  Due: ${item.dueDate}`);
});

// Extract key points
const keyPointsSummary = await summarizer.summarizeThread(thread, {
  mode: 'key-points',
});

console.log('Key Points:');
keyPointsSummary.keyPoints?.forEach((point) => {
  console.log(`- ${point}`);
});

// Summarize single email in detailed mode
const emailSummary = await summarizer.summarizeEmail(email, {
  mode: 'detailed',
});

console.log(emailSummary.summary);
console.log(`Participants: ${emailSummary.participants.join(', ')}`);
console.log(`Tokens used: ${emailSummary.tokensUsed}`);
console.log(`Generation time: ${emailSummary.generationTimeMs}ms`);

// Configure summarizer
summarizer.setConfig({
  defaultMode: 'key-points',
  maxMessagesInContext: 15,
});

const config = summarizer.getConfig();
console.log(`Default mode: ${config.defaultMode}`);
```

Available summarization modes:

- `brief` - Ultra-concise 1-2 sentence summaries
- `detailed` - Comprehensive summaries with key points and context
- `action-items` - Extracted tasks with assignees and deadlines
- `key-points` - Bullet list of important information

### Tier 3: Narrative Generation

The `NarrativeGenerator` converts email clusters, red flags, and summaries into
podcast-style briefing scripts optimized for voice delivery.

```typescript
import {
  NarrativeGenerator,
  TopicClusterer,
  RedFlagScorer,
  EmailSummarizer,
  LLMClient,
} from '@nexus-aec/intelligence';

// Initialize components
const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
const clusterer = new TopicClusterer();
const scorer = new RedFlagScorer({
  keywordMatcher,
  vipDetector,
  velocityDetector,
  calendarDetector,
});
const summarizer = new EmailSummarizer({ llmClient });
const generator = new NarrativeGenerator({
  llmClient,
  defaultStyle: 'conversational',
  maxTopics: 10,
});

// Process emails
const clusterResult = clusterer.cluster(emails);
const redFlagScores = new Map();
const summaries = new Map();

for (const cluster of clusterResult.clusters) {
  // Score emails for red flags
  for (const emailId of cluster.emailIds) {
    const email = emails.find((e) => e.id === emailId);
    if (email) {
      const score = await scorer.scoreEmail(email, thread, signals);
      redFlagScores.set(emailId, score);
    }
  }

  // Summarize threads
  for (const threadId of cluster.threadIds) {
    const thread = threads.find((t) => t.id === threadId);
    if (thread) {
      const summary = await summarizer.summarizeThread(thread, {
        mode: 'brief',
      });
      summaries.set(threadId, summary);
    }
  }
}

// Generate briefing script
const script = await generator.generateBriefing({
  clusters: clusterResult.clusters,
  redFlagScores,
  summaries,
  userName: 'Alex',
  currentTime: new Date(),
});

// Use the script segments
console.log(
  `Briefing: ${script.topicCount} topics, ${script.redFlagCount} red flags`
);
console.log(`Estimated time: ${Math.ceil(script.totalSeconds / 60)} minutes\n`);

for (const segment of script.segments) {
  console.log(
    `[${segment.type.toUpperCase()}] (~${segment.estimatedSeconds}s)`
  );
  console.log(segment.content);
  console.log();
}

// Generate in different styles
const formalScript = await generator.generateBriefing(
  { clusters: clusterResult.clusters, redFlagScores, summaries },
  { style: 'formal' }
);

const executiveScript = await generator.generateBriefing(
  { clusters: clusterResult.clusters, redFlagScores, summaries },
  { style: 'executive' }
);

// Configure generator
generator.setConfig({
  defaultStyle: 'concise',
  maxTopics: 5,
  includeOpening: true,
  includeClosing: true,
});
```

Available narrative styles:

- `conversational` - Warm, friendly tone like a trusted colleague
- `formal` - Professional, respectful, and precise language
- `executive` - Concise and direct, gets to the point quickly
- `concise` - Extremely brief with minimal words

### Tier 3: Red Flag Explanation

The `ExplanationGenerator` creates natural language explanations for why emails
are flagged as urgent, converting technical scoring into user-friendly
explanations.

```typescript
import {
  ExplanationGenerator,
  RedFlagScorer,
  LLMClient,
} from '@nexus-aec/intelligence';

// Initialize components
const llmClient = new LLMClient({ apiKey: process.env.OPENAI_API_KEY! });
const scorer = new RedFlagScorer({
  keywordMatcher,
  vipDetector,
  velocityDetector,
  calendarDetector,
});
const explainer = new ExplanationGenerator({
  llmClient,
  defaultStyle: 'detailed',
  includeSuggestedAction: true,
});

// Score an email
const redFlagScore = await scorer.scoreEmail(email, thread, signals);

// Generate explanation
if (redFlagScore.isFlagged) {
  const explanation = await explainer.explain(redFlagScore, email, {
    style: 'detailed',
    thread,
  });

  console.log(`Urgency: ${explanation.urgencyLevel}`);
  console.log(`\nExplanation: ${explanation.explanation}`);

  console.log('\nKey Factors:');
  explanation.keyFactors.forEach((factor) => {
    console.log(`  - ${factor}`);
  });

  if (explanation.suggestedAction) {
    console.log(`\nSuggested Action: ${explanation.suggestedAction}`);
  }
}

// Generate different explanation styles
const conciseExplanation = await explainer.explain(redFlagScore, email, {
  style: 'concise',
});

const technicalExplanation = await explainer.explain(redFlagScore, email, {
  style: 'technical',
});

const casualExplanation = await explainer.explain(redFlagScore, email, {
  style: 'casual',
});

// Generate basic explanation without LLM (faster, rule-based)
const basicExplanation = explainer.explainBasic(redFlagScore, email);
console.log(basicExplanation.explanation);

// Configure explainer
explainer.setConfig({
  defaultStyle: 'concise',
  includeSuggestedAction: false,
});
```

Available explanation styles:

- `detailed` - Thorough explanations with context and specific details (3-4
  sentences)
- `concise` - Brief and direct, gets to the point quickly (1-2 sentences)
- `technical` - Includes technical details about scoring and signal
  contributions
- `casual` - Conversational, friendly language like talking to a colleague

### Tier 3: User Preferences

The `PreferencesStore` manages user preferences with encrypted local storage and
sync capabilities for VIPs, keywords, topics, and muted senders.

```typescript
import { PreferencesStore } from '@nexus-aec/intelligence';

// Generate encryption key (do this once, store securely)
const encryptionKey = PreferencesStore.generateEncryptionKey();
console.log('Save this key securely:', encryptionKey);

// Initialize store
const preferencesStore = new PreferencesStore({
  storagePath: './data/preferences',
  encryptionKey: process.env.PREFERENCES_ENCRYPTION_KEY!,
  autoSync: true,
  onSync: async (preferences) => {
    // Sync to cloud/server
    await api.syncPreferences(preferences);
  },
});

await preferencesStore.initialize();

// VIP Management
await preferencesStore.addVip({
  identifier: 'ceo@company.com',
  name: 'CEO',
  note: 'Executive leadership',
});

// Domain-based VIP (all emails from this domain)
await preferencesStore.addVip({
  identifier: '@importantclient.com',
  name: 'Important Client',
});

// Check if email is from VIP
const isVip = await preferencesStore.isVip('ceo@company.com');
if (isVip) {
  console.log('This email is from a VIP!');
}

// Get all VIPs
const vips = await preferencesStore.getVips();

// Remove VIP
await preferencesStore.removeVip('ceo@company.com');

// Custom Keywords
await preferencesStore.addKeyword({
  pattern: 'critical',
  isRegex: false,
  weight: 0.95,
  category: 'urgency',
});

// Regex keyword
await preferencesStore.addKeyword({
  pattern: '\\b(asap|urgent|priority)\\b',
  isRegex: true,
  weight: 0.9,
  category: 'urgency',
});

const keywords = await preferencesStore.getKeywords();

// Topic Preferences
await preferencesStore.setTopicPreference({
  topic: 'Project Updates',
  priority: 0.8,
  muted: false,
});

// Mute a topic
await preferencesStore.setTopicPreference({
  topic: 'Marketing Newsletter',
  priority: 0.1,
  muted: true,
});

const topics = await preferencesStore.getTopicPreferences();

// Muted Senders
await preferencesStore.muteSender({
  identifier: 'spam@example.com',
  reason: 'Too many promotional emails',
});

// Temporary mute (expires after 7 days)
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + 7);

await preferencesStore.muteSender({
  identifier: 'newsletter@company.com',
  reason: 'On vacation',
  expiresAt,
});

// Domain-based mute
await preferencesStore.muteSender({
  identifier: '@spammydomain.com',
  reason: 'Spam domain',
});

// Check if sender is muted
const isMuted = await preferencesStore.isMuted('spam@example.com');

// Import/Export
const exported = await preferencesStore.exportPreferences();
console.log(
  `Exported ${exported.vips.length} VIPs, ${exported.keywords.length} keywords`
);

// Import with conflict resolution
await preferencesStore.importPreferences(remotePreferences, 'merge');
// Strategies: 'local' (keep local), 'remote' (use remote), 'merge' (combine)

// Clear all preferences
await preferencesStore.clear();
```

Features:

- **Encrypted Storage**: AES-256-CBC encryption for sensitive data
- **Auto-sync**: Optional automatic syncing to remote storage
- **Domain Matching**: VIP and mute rules can apply to entire domains
- **Expiring Mutes**: Temporary mutes with automatic expiration
- **Conflict Resolution**: Smart merging for multi-device scenarios
- **Version Tracking**: Automatic versioning for conflict detection

### Tier 3: Feedback Learning

The `FeedbackLearner` processes user feedback to adjust red flag scoring weights
over time, improving accuracy through continuous learning.

```typescript
import { FeedbackLearner, RedFlagScorer } from '@nexus-aec/intelligence';

// Initialize learner
const feedbackLearner = new FeedbackLearner({
  storagePath: './data/feedback',
  learningRate: 0.1, // Conservative learning
  minFeedbackCount: 10, // Need 10 samples before adjusting
  maxAdjustment: 0.3, // Max ±0.3 adjustment
});

await feedbackLearner.initialize();

// Initialize scorer (assume already configured)
const scorer = new RedFlagScorer({
  keywordMatcher,
  vipDetector,
  velocityDetector,
  calendarDetector,
});

// Score an email
const score = await scorer.scoreEmail(email, thread, signals);

// User provides feedback
if (userDisagreed) {
  await feedbackLearner.recordFeedback({
    emailId: email.id,
    type: 'false_positive', // Was flagged but shouldn't have been
    originalScore: score.score,
    signals: {
      keyword: score.signalBreakdown.find((s) => s.signal === 'keyword')
        ?.rawScore,
      vip: score.signalBreakdown.find((s) => s.signal === 'vip')?.rawScore,
      velocity: score.signalBreakdown.find((s) => s.signal === 'velocity')
        ?.rawScore,
      calendar: score.signalBreakdown.find((s) => s.signal === 'calendar')
        ?.rawScore,
    },
    note: 'User said this was not urgent',
  });
}

// Record different feedback types
await feedbackLearner.recordFeedback({
  emailId: 'email-1',
  type: 'correct', // System was correct
  originalScore: 0.85,
  signals: { keyword: 0.9, vip: 1.0, velocity: 0.7 },
});

await feedbackLearner.recordFeedback({
  emailId: 'email-2',
  type: 'false_negative', // Should have been flagged
  originalScore: 0.25,
  signals: { keyword: 0.3, vip: 0.0, velocity: 0.2 },
});

await feedbackLearner.recordFeedback({
  emailId: 'email-3',
  type: 'too_high', // Flagged but severity too high
  originalScore: 0.85,
  expectedScore: 0.65, // User's expected score
  signals: { keyword: 0.9, vip: 0.0, velocity: 0.8 },
});

// Get recommended weight adjustments
const adjustments = await feedbackLearner.getWeightAdjustments();
console.log('Recommended adjustments:', adjustments);
// { keyword: -0.15, vip: 0.05, velocity: -0.08, calendar: 0.02 }

// Apply adjustments to scorer
scorer.setConfig({
  keywordWeight: 0.8 + adjustments.keyword, // Original + adjustment
  vipWeight: 0.7 + adjustments.vip,
  velocityWeight: 0.9 + adjustments.velocity,
  calendarWeight: 0.6 + adjustments.calendar,
});

// Get learning statistics
const stats = await feedbackLearner.getStats();
console.log(`Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);
console.log(`Precision: ${(stats.precision * 100).toFixed(1)}%`);
console.log(`Total feedback: ${stats.totalFeedback}`);
console.log(`False positives: ${stats.falsePositiveCount}`);
console.log(`False negatives: ${stats.falseNegativeCount}`);

// Get recent feedback
const recentFeedback = await feedbackLearner.getFeedback({
  limit: 10,
  offset: 0,
});

// Filter by type
const falsePositives = await feedbackLearner.getFeedback({
  type: 'false_positive',
  limit: 20,
});

// Clear feedback (for testing or reset)
await feedbackLearner.clear();
```

How it works:

- **Gradient Descent**: Uses error signals to adjust weights
- **Learning Rate**: Controls how quickly weights change (default: 0.1)
- **Min Feedback**: Requires minimum samples before adjusting to avoid
  overfitting
- **Max Adjustment**: Caps adjustments to prevent drastic changes
- **Error Calculation**:
  - False positive: Negative error (reduce weights)
  - False negative: Positive error (increase weights)
  - Correct: No error (maintain weights)

Feedback types:

- `correct` - System prediction was accurate
- `false_positive` - Incorrectly flagged as urgent
- `false_negative` - Should have been flagged but wasn't
- `too_high` - Flagged correctly but severity overestimated
- `too_low` - Flagged correctly but severity underestimated

## API Reference

See the following files for detailed API documentation:

### Tier 1

- `src/red-flags/keyword-matcher.ts` - Keyword pattern matching
- `src/red-flags/vip-detector.ts` - VIP identification
- `src/red-flags/thread-velocity.ts` - Email velocity analysis
- `src/red-flags/calendar-proximity.ts` - Calendar integration
- `src/red-flags/scorer.ts` - Composite scoring
- `src/red-flags/topic-clusterer.ts` - Topic clustering

### Tier 2

- `src/session/drive-state.ts` - Briefing state management
- `src/session/redis-session-store.ts` - Redis persistence
- `src/session/shadow-processor.ts` - Voice command detection

### Tier 3

- `src/knowledge/supabase-vector-store.ts` - Vector storage and search
- `src/knowledge/asset-types.ts` - Type definitions and validation
- `src/knowledge/csv-parser.ts` - CSV parsing with flexible column mapping
- `src/knowledge/pdf-extractor.ts` - PDF text extraction
- `src/knowledge/asset-ingestion.ts` - Ingestion orchestration
- `src/knowledge/rag-retriever.ts` - RAG semantic search interface
- `src/knowledge/llm-client.ts` - GPT-4o API integration with retry and rate
  limiting
- `src/knowledge/email-summarizer.ts` - Email thread summarization with multiple
  modes
- `src/knowledge/narrative-generator.ts` - Podcast-style briefing script
  generation
- `src/knowledge/explanation-generator.ts` - Natural language explanations for
  red flags
- `src/knowledge/preferences-store.ts` - Encrypted user preferences with sync
- `src/knowledge/feedback-learner.ts` - Continuous learning from user feedback

## Data Files

### Seed Data

Located in `data/`:

- `seed-assets.json` - 39 sample assets for development/testing
- `seed-safety-manuals.json` - 7 sample safety documents
- `assets-template.csv` - CSV template for asset imports
- `README.md` - Detailed data format documentation

### Validation Scripts

Located in `scripts/`:

- `validate-seed-data.ts` - Validate asset seed data
- `validate-safety-manuals.ts` - Validate safety manual seed data

## Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test csv-parser
```

Test coverage:

- 763 total tests
- All major components fully tested
- Mocked external dependencies (Redis, Supabase, OpenAI, file system)

## Development

```bash
# Install dependencies
pnpm install

# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Build
pnpm build

# Clean build artifacts
pnpm clean
```

## Architecture

### Vector Storage

Uses Supabase with pgvector extension:

- **Embeddings**: OpenAI text-embedding-3-small (1536 dimensions)
- **Indexing**: IVFFlat for efficient similarity search
- **Similarity**: Cosine distance (`<=>` operator)

### Ingestion Pipeline

1. **Load**: Read from CSV, JSON, or PDF
2. **Validate**: Check required fields and data types
3. **Transform**: Normalize categories, extract metadata
4. **Embed**: Generate vector embeddings (with retry + backoff)
5. **Store**: Upsert to vector database in batches

### Search Pipeline

1. **Query**: User provides natural language query
2. **Embed**: Generate query embedding
3. **Search**: Find similar documents by cosine similarity
4. **Filter**: Apply source type and metadata filters
5. **Rank**: Sort by similarity score
6. **Return**: Retrieve matching documents with metadata

## Performance

### Ingestion

- **Batch size**: 10 documents per batch (configurable)
- **Concurrency**: 5 concurrent embedding requests (configurable)
- **Retry logic**: 3 attempts with exponential backoff
- **Rate limits**: Respects OpenAI API limits

### Search

- **Response time**: <100ms for typical queries
- **Index type**: IVFFlat for efficient vector search
- **Caching**: Supabase connection pooling

## Troubleshooting

### "Missing required columns" error

Ensure your CSV has all required fields. The parser supports various naming
conventions:

- Try: `AssetID`, `Asset ID`, `assetId`, `asset_id`, `id`
- See "Column Name Flexibility" section above

### "OpenAI API rate limit exceeded"

Reduce concurrency in ingestion:

```bash
pnpm tsx cli/ingest-assets.ts --file data.csv --max-concurrency 2
```

### "Failed to connect to Supabase"

Verify credentials and database status:

```bash
# Check .env file has correct values
cat .env

# Check Supabase status
cd supabase && supabase status
```

### Embedding generation slow

Use smaller batch sizes:

```bash
pnpm tsx cli/ingest-assets.ts --file data.csv --batch-size 5
```

## Documentation

- **CLI Tools**: `cli/README.md` - Comprehensive CLI documentation
- **Data Formats**: `data/README.md` - Asset and CSV format specifications
- **Task Tracking**: See task file in project root for implementation details

## Contributing

1. Ensure all tests pass: `pnpm test`
2. Run linting: `pnpm lint:fix`
3. Update documentation for new features
4. Follow existing code patterns and conventions

## License

Private - Part of NexusAEC project

## Support

For issues or questions:

- Review this README and related documentation
- Check the task file for implementation details
- See inline code documentation for API usage
