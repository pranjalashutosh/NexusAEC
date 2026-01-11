# Task List: Voice-Driven AI Executive Assistant

> Generated from: `0001-prd-voice-exec-assistant.md`
> **Architecture**: Unified LiveKit Voice Stack

---

## Relevant Files

### Monorepo Root
- `package.json` - Root package.json for monorepo workspaces
- `turbo.json` - Turborepo configuration for build orchestration
- `tsconfig.base.json` - Shared TypeScript configuration
- `.eslintrc.js` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `.github/workflows/ci.yml` - CI/CD pipeline configuration
- `.env.example` - Environment variables template (LiveKit, Supabase, Redis, LLM keys)

### Shared Packages (`packages/`)
- `packages/shared-types/src/index.ts` - Shared TypeScript type definitions (StandardEmail, Thread, RedFlag, VIP, etc.)
- `packages/shared-types/src/index.test.ts` - Type validation tests
- `packages/encryption/src/index.ts` - Encryption utilities (AES-256, key derivation)
- `packages/encryption/src/index.test.ts` - Encryption utility tests
- `packages/secure-storage/src/index.ts` - Secure storage abstraction (Keychain, Credential Manager)
- `packages/secure-storage/src/index.test.ts` - Secure storage tests
- `packages/logger/src/index.ts` - Structured logging (no PII)
- `packages/logger/src/index.test.ts` - Logger tests

### Email Integration - Unified Adapter Pattern (`packages/email-providers/`)
- `packages/email-providers/src/interfaces/email-provider.ts` - EmailProvider interface (fetchThreads, createDraft, markRead, etc.)
- `packages/email-providers/src/interfaces/types.ts` - StandardEmail, StandardThread, StandardDraft types
- `packages/email-providers/src/adapters/outlook-adapter.ts` - OutlookAdapter implementing EmailProvider (Microsoft Graph)
- `packages/email-providers/src/adapters/outlook-adapter.test.ts` - Outlook adapter tests
- `packages/email-providers/src/adapters/gmail-adapter.ts` - GmailAdapter implementing EmailProvider (Google API)
- `packages/email-providers/src/adapters/gmail-adapter.test.ts` - Gmail adapter tests
- `packages/email-providers/src/oauth/microsoft.ts` - Microsoft OAuth 2.0 implementation
- `packages/email-providers/src/oauth/microsoft.test.ts` - Microsoft OAuth tests
- `packages/email-providers/src/oauth/google.ts` - Google OAuth 2.0 implementation
- `packages/email-providers/src/oauth/google.test.ts` - Google OAuth tests
- `packages/email-providers/src/oauth/token-manager.ts` - Token storage, refresh, expiration handling
- `packages/email-providers/src/oauth/token-manager.test.ts` - Token manager tests
- `packages/email-providers/src/services/unified-inbox.ts` - UnifiedInboxService (polls adapters, normalizes, tags source)
- `packages/email-providers/src/services/unified-inbox.test.ts` - Unified inbox tests
- `packages/email-providers/src/services/smart-draft.ts` - Smart Draft Logic (reply source routing, Outlook default)
- `packages/email-providers/src/services/smart-draft.test.ts` - Smart draft tests
- `packages/email-providers/src/services/calendar-sync.ts` - Calendar sync (both providers)
- `packages/email-providers/src/services/calendar-sync.test.ts` - Calendar sync tests
- `packages/email-providers/src/services/contacts-sync.ts` - Contacts/directory fetch for VIP suggestions
- `packages/email-providers/src/services/contacts-sync.test.ts` - Contacts sync tests

### Intelligence Layer - Three-Tier Memory (`packages/intelligence/`)

#### Tier 1: Ephemeral (In-Memory Processing)
- `packages/intelligence/src/red-flags/scorer.ts` - Red Flag scoring algorithm
- `packages/intelligence/src/red-flags/scorer.test.ts` - Red Flag scorer tests
- `packages/intelligence/src/red-flags/keyword-matcher.ts` - Keyword/phrase matching engine
- `packages/intelligence/src/red-flags/keyword-matcher.test.ts` - Keyword matcher tests
- `packages/intelligence/src/red-flags/vip-detector.ts` - VIP sender detection
- `packages/intelligence/src/red-flags/vip-detector.test.ts` - VIP detector tests
- `packages/intelligence/src/red-flags/thread-velocity.ts` - Thread velocity calculation
- `packages/intelligence/src/red-flags/thread-velocity.test.ts` - Thread velocity tests
- `packages/intelligence/src/red-flags/calendar-proximity.ts` - Calendar proximity scoring
- `packages/intelligence/src/red-flags/calendar-proximity.test.ts` - Calendar proximity tests
- `packages/intelligence/src/red-flags/default-patterns.ts` - Default red-flag patterns
- `packages/intelligence/src/clustering/topic-clusterer.ts` - Topic/project clustering service
- `packages/intelligence/src/clustering/topic-clusterer.test.ts` - Topic clusterer tests

#### Tier 2: Session State (Redis)
- `packages/intelligence/src/session/redis-session-store.ts` - RedisSessionStore for live "Drive State"
- `packages/intelligence/src/session/redis-session-store.test.ts` - Redis session store tests
- `packages/intelligence/src/session/drive-state.ts` - DriveState type (currentTopic, interruptStatus, itemsRemaining, position)
- `packages/intelligence/src/session/shadow-processor.ts` - Background service for real-time transcript → state updates ("Ack & Act")
- `packages/intelligence/src/session/shadow-processor.test.ts` - Shadow processor tests

#### Tier 3: Knowledge Base (Supabase Vector)
- `packages/intelligence/src/knowledge/supabase-vector-store.ts` - SupabaseVectorStore for domain knowledge
- `packages/intelligence/src/knowledge/supabase-vector-store.test.ts` - Vector store tests
- `packages/intelligence/src/knowledge/asset-ingestion.ts` - Ingest assets from various sources (CSV, JSON, API)
- `packages/intelligence/src/knowledge/asset-ingestion.test.ts` - Asset ingestion tests
- `packages/intelligence/src/knowledge/rag-retriever.ts` - RAG retrieval for contextual grounding
- `packages/intelligence/src/knowledge/rag-retriever.test.ts` - RAG retriever tests

#### Asset Data Sources (`packages/intelligence/src/knowledge/sources/`)
- `packages/intelligence/src/knowledge/sources/seed-assets.json` - MVP seed data: hardcoded NCE Asset IDs, descriptions, metadata
- `packages/intelligence/src/knowledge/sources/seed-safety-manuals.json` - MVP seed data: safety manual excerpts
- `packages/intelligence/src/knowledge/sources/csv-parser.ts` - Parse CSV uploads (Asset ID, Description, Category, Location)
- `packages/intelligence/src/knowledge/sources/csv-parser.test.ts` - CSV parser tests
- `packages/intelligence/src/knowledge/sources/pdf-extractor.ts` - Extract text from Safety Manual PDFs
- `packages/intelligence/src/knowledge/sources/pdf-extractor.test.ts` - PDF extractor tests

#### Asset Admin CLI (`packages/intelligence/src/cli/`)
- `packages/intelligence/src/cli/ingest-assets.ts` - CLI command: `npx ingest-assets --source csv --file assets.csv`
- `packages/intelligence/src/cli/ingest-manuals.ts` - CLI command: `npx ingest-manuals --source pdf --dir ./manuals/`
- `packages/intelligence/src/cli/list-assets.ts` - CLI command: `npx list-assets` (verify what's in vector store)
- `packages/intelligence/src/cli/clear-assets.ts` - CLI command: `npx clear-assets --confirm` (reset vector store)

#### Asset Data Templates (`data/`)
- `data/assets-template.csv` - Template CSV with example rows: `AssetID,Name,Description,Category,Location`
- `data/assets-example.csv` - 10 example NCE assets for reference
- `data/README.md` - Documentation: how to prepare asset data for ingestion

#### Briefing & Summarization
- `packages/intelligence/src/summarization/llm-client.ts` - LLM integration (GPT-4o)
- `packages/intelligence/src/summarization/llm-client.test.ts` - LLM client tests
- `packages/intelligence/src/summarization/email-summarizer.ts` - Email/thread summarization
- `packages/intelligence/src/summarization/email-summarizer.test.ts` - Email summarizer tests
- `packages/intelligence/src/briefing/narrative-generator.ts` - Podcast script generator
- `packages/intelligence/src/briefing/narrative-generator.test.ts` - Narrative generator tests
- `packages/intelligence/src/briefing/explanation-generator.ts` - "Why this is a red flag" explanations
- `packages/intelligence/src/briefing/explanation-generator.test.ts` - Explanation generator tests

#### Personalization
- `packages/intelligence/src/personalization/preferences-store.ts` - VIPs, keywords, muted senders storage
- `packages/intelligence/src/personalization/preferences-store.test.ts` - Preferences store tests
- `packages/intelligence/src/personalization/feedback-learner.ts` - Learning from user feedback
- `packages/intelligence/src/personalization/feedback-learner.test.ts` - Feedback learner tests

### LiveKit Voice Stack (`packages/livekit-agent/`)
- `packages/livekit-agent/src/index.ts` - Agent entry point
- `packages/livekit-agent/src/agent.ts` - LiveKit Backend Agent (room management, participant handling)
- `packages/livekit-agent/src/agent.test.ts` - Agent tests
- `packages/livekit-agent/src/config.ts` - LiveKit Cloud credentials, Deepgram/ElevenLabs config
- `packages/livekit-agent/src/reasoning-loop.ts` - GPT-4o Reasoning Loop (intent → action → response)
- `packages/livekit-agent/src/reasoning-loop.test.ts` - Reasoning loop tests
- `packages/livekit-agent/src/tools/email-tools.ts` - Function tools for email actions (mute, prioritize, draft, etc.)
- `packages/livekit-agent/src/tools/email-tools.test.ts` - Email tools tests
- `packages/livekit-agent/src/tools/navigation-tools.ts` - Function tools for briefing navigation (skip, repeat, go deeper)
- `packages/livekit-agent/src/tools/navigation-tools.test.ts` - Navigation tools tests
- `packages/livekit-agent/src/stt/deepgram-config.ts` - Deepgram Nova-2 configuration with custom vocabulary
- `packages/livekit-agent/src/tts/elevenlabs-config.ts` - ElevenLabs Turbo v2.5 configuration
- `packages/livekit-agent/src/prompts/system-prompt.ts` - System prompt for GPT-4o (persona, constraints, tool usage)
- `packages/livekit-agent/src/prompts/briefing-prompts.ts` - Prompts for generating briefing segments
- `packages/livekit-agent/Dockerfile` - Container for deploying agent

### Mobile App (`apps/mobile/`)
- `apps/mobile/src/App.tsx` - Root application component
- `apps/mobile/src/navigation/index.tsx` - Navigation configuration
- `apps/mobile/src/screens/Welcome.tsx` - Welcome screen (Quick Start / Personalize)
- `apps/mobile/src/screens/Welcome.test.tsx` - Welcome screen tests
- `apps/mobile/src/screens/onboarding/ConnectAccount.tsx` - OAuth connection screen
- `apps/mobile/src/screens/onboarding/ConnectAccount.test.tsx` - Connect account tests
- `apps/mobile/src/screens/onboarding/VIPSelection.tsx` - VIP selection screen
- `apps/mobile/src/screens/onboarding/VIPSelection.test.tsx` - VIP selection tests
- `apps/mobile/src/screens/onboarding/TopicSelection.tsx` - Projects/Topics selection screen
- `apps/mobile/src/screens/onboarding/TopicSelection.test.tsx` - Topic selection tests
- `apps/mobile/src/screens/onboarding/KeywordSelection.tsx` - Red-Flag Keywords screen
- `apps/mobile/src/screens/onboarding/KeywordSelection.test.tsx` - Keyword selection tests
- `apps/mobile/src/screens/onboarding/Confirmation.tsx` - Setup confirmation/summary screen
- `apps/mobile/src/screens/onboarding/Confirmation.test.tsx` - Confirmation screen tests
- `apps/mobile/src/screens/BriefingRoom.tsx` - LiveKit Room-based briefing UI (replaces BriefingPlayer)
- `apps/mobile/src/screens/BriefingRoom.test.tsx` - Briefing room tests
- `apps/mobile/src/screens/Settings.tsx` - Settings screen
- `apps/mobile/src/screens/Settings.test.tsx` - Settings screen tests
- `apps/mobile/src/screens/PrivacyDashboard.tsx` - Privacy Dashboard
- `apps/mobile/src/screens/PrivacyDashboard.test.tsx` - Privacy Dashboard tests
- `apps/mobile/src/screens/PendingActions.tsx` - Pending Actions view (queued commands)
- `apps/mobile/src/screens/PendingActions.test.tsx` - Pending Actions tests
- `apps/mobile/src/components/LiveKitRoom.tsx` - @livekit/react-native Room wrapper
- `apps/mobile/src/components/LiveKitRoom.test.tsx` - LiveKit Room tests
- `apps/mobile/src/components/ConnectionQualityIndicator.tsx` - Visual indicator for connection quality
- `apps/mobile/src/components/PTTButton.tsx` - Push-to-talk button (triggers LiveKit data message)
- `apps/mobile/src/components/PTTButton.test.tsx` - PTT button tests
- `apps/mobile/src/components/SyncStatus.tsx` - Sync status indicator
- `apps/mobile/src/components/VIPContactRow.tsx` - VIP contact row (toggle, avatar)
- `apps/mobile/src/components/TopicChip.tsx` - Topic/keyword chip component
- `apps/mobile/src/hooks/useLiveKitRoom.ts` - Hook for LiveKit room connection, token fetch
- `apps/mobile/src/hooks/useConnectionQuality.ts` - Hook for monitoring ConnectionQuality events (dead zone handling)
- `apps/mobile/src/hooks/useNetworkStatus.ts` - Network connectivity hook
- `apps/mobile/src/services/offline-queue.ts` - Offline action queue
- `apps/mobile/src/services/offline-queue.test.ts` - Offline queue tests
- `apps/mobile/src/services/livekit-token.ts` - Fetch LiveKit room token from backend
- `apps/mobile/src/store/index.ts` - State management (Zustand/Redux)

### Desktop App (`apps/desktop/`)
- `apps/desktop/src/main.ts` - Electron main process
- `apps/desktop/src/preload.ts` - Electron preload script
- `apps/desktop/src/renderer/App.tsx` - Root renderer component
- `apps/desktop/src/renderer/pages/DraftsList.tsx` - "Drafts Pending Review" list view
- `apps/desktop/src/renderer/pages/DraftsList.test.tsx` - Drafts list tests
- `apps/desktop/src/renderer/pages/DraftDetail.tsx` - Draft detail view (content, thread, approve/send)
- `apps/desktop/src/renderer/pages/DraftDetail.test.tsx` - Draft detail tests
- `apps/desktop/src/renderer/pages/SessionActivity.tsx` - Session activity view (audit log)
- `apps/desktop/src/renderer/pages/SessionActivity.test.tsx` - Session activity tests
- `apps/desktop/src/renderer/pages/AllActivity.tsx` - All activity view (filterable history)
- `apps/desktop/src/renderer/pages/AllActivity.test.tsx` - All activity tests
- `apps/desktop/src/renderer/pages/Settings.tsx` - Settings screen
- `apps/desktop/src/renderer/pages/Settings.test.tsx` - Settings tests
- `apps/desktop/src/renderer/pages/PrivacyDashboard.tsx` - Privacy Dashboard
- `apps/desktop/src/renderer/components/DraftCard.tsx` - Draft card component
- `apps/desktop/src/renderer/components/ActivityRow.tsx` - Activity log row component
- `apps/desktop/src/renderer/components/UndoButton.tsx` - Undo action button
- `apps/desktop/src/services/draft-sync.ts` - Draft sync service
- `apps/desktop/src/services/draft-sync.test.ts` - Draft sync tests
- `apps/desktop/src/services/audit-trail.ts` - Audit trail service
- `apps/desktop/src/services/audit-trail.test.ts` - Audit trail tests
- `apps/desktop/src/services/export.ts` - Audit trail export (CSV, JSON)
- `apps/desktop/src/services/export.test.ts` - Export service tests
- `apps/desktop/src/services/preferences-sync.ts` - Preferences sync with mobile
- `apps/desktop/src/services/preferences-sync.test.ts` - Preferences sync tests

### Backend API (`apps/api/`)
- `apps/api/src/index.ts` - API entry point (Express/Fastify)
- `apps/api/src/routes/auth.ts` - OAuth callback handlers
- `apps/api/src/routes/livekit-token.ts` - Generate LiveKit room tokens
- `apps/api/src/routes/livekit-token.test.ts` - Token route tests
- `apps/api/src/routes/sync.ts` - Sync endpoints (drafts, preferences)
- `apps/api/src/middleware/auth.ts` - JWT authentication middleware
- `apps/api/Dockerfile` - Container for API deployment

### Infrastructure
- `infra/docker-compose.yml` - Local dev environment (Redis, Supabase, API, Agent)
- `infra/k8s/` - Kubernetes manifests for production deployment

### Notes

- Unit tests should be placed alongside source files (e.g., `scorer.ts` → `scorer.test.ts`).
- Use `npx jest [optional/path/to/test/file]` to run tests.
- Use `npx turbo run test` to run all tests across the monorepo.
- Mobile app uses React Native with `@livekit/react-native` SDK.
- Desktop app uses Electron with React.
- Voice processing is handled entirely by LiveKit Cloud (Deepgram STT + ElevenLabs TTS + GPT-4o).
- All sensitive data (tokens, preferences) must use `packages/secure-storage` and `packages/encryption`.

### Asset Data Strategy (Tier 3 Knowledge Base)

**MVP (Development/Testing):**
- Use hardcoded seed files: `seed-assets.json` (20-50 assets), `seed-safety-manuals.json` (5-10 excerpts)
- Run: `npx ts-node cli/ingest-assets.ts --source seed`
- No external data dependencies — developers can start immediately

**Production:**
- Client provides asset data as CSV export from their asset management system (e.g., NCE, Maximo, SAP PM)
- Client provides Safety Manuals as PDF files
- Run: `npx ts-node cli/ingest-assets.ts --source csv --file ./client-data/assets.csv`
- Run: `npx ts-node cli/ingest-manuals.ts --source pdf --dir ./client-data/manuals/`

**Expected CSV Format:**
```csv
AssetID,Name,Description,Category,Location,Criticality
P-104,Pump Station 104,Main water distribution pump for Riverside district,Pump,Riverside Bridge,High
V-201,Valve Assembly 201,Pressure regulation valve for north sector,Valve,North Plant,Medium
```

---

## Tasks

- [x] **1.0 Project Foundation & Infrastructure**
  - [x] 1.1 Initialize monorepo with Turborepo (`turbo.json`, root `package.json` with workspaces)
  - [x] 1.2 Create shared packages structure (`packages/shared-types`, `packages/encryption`, `packages/secure-storage`, `packages/logger`)
  - [x] 1.3 Configure TypeScript with strict mode (`tsconfig.base.json` + per-package configs)
  - [x] 1.4 Configure ESLint and Prettier with consistent rules across all packages
  - [x] 1.5 Set up CI/CD pipeline with GitHub Actions (lint, type-check, test, build, deploy agent)
  - [x] 1.6 Implement `packages/encryption`: AES-256 encryption/decryption utilities and key derivation functions
  - [x] 1.7 Implement `packages/secure-storage`: platform-agnostic secure storage abstraction (Keychain for iOS/macOS, EncryptedSharedPreferences for Android, Credential Manager for Windows)
  - [x] 1.8 Implement `packages/logger`: structured logging utility with PII filtering
  - [x] 1.9 Define shared types in `packages/shared-types`: `StandardEmail`, `StandardThread`, `CalendarEvent`, `Contact`, `RedFlag`, `VIP`, `Topic`, `Draft`, `AuditEntry`, `UserPreferences`, `DriveState` *(completed in 1.2)*
  - [x] 1.10 Set up local development environment with Docker Compose (Redis, Supabase, API mock)
  - [x] 1.11 Create `.env.example` with all required environment variables (LiveKit, Supabase, Redis, OpenAI, Deepgram, ElevenLabs)

- [x] **2.0 Email Provider Integration — Unified Adapter Pattern**
  - [x] 2.1 Define `EmailProvider` interface (`email-provider.ts`): common methods `fetchThreads()`, `fetchUnread()`, `createDraft()`, `sendDraft()`, `markRead()`, `markUnread()`, `moveToFolder()`, `applyLabel()`, `getContacts()`, `getCalendarEvents()`
  - [x] 2.2 Define `StandardEmail`, `StandardThread`, `StandardDraft` types with `source: 'OUTLOOK' | 'GMAIL'` discriminator
  - [x] 2.3 Implement Microsoft OAuth 2.0 flow (`oauth/microsoft.ts`) with PKCE, scopes for Mail.Read, Calendars.Read, Contacts.Read, Mail.ReadWrite
  - [x] 2.4 Implement Google OAuth 2.0 flow (`oauth/google.ts`) with PKCE, scopes for Gmail, Calendar, Contacts
  - [x] 2.5 Implement `token-manager.ts`: secure token storage, automatic refresh before expiration, refresh failure handling with user notification
  - [x] 2.6 Implement `OutlookAdapter` (`adapters/outlook-adapter.ts`): implement `EmailProvider` interface using Microsoft Graph API
  - [x] 2.7 Implement `GmailAdapter` (`adapters/gmail-adapter.ts`): implement `EmailProvider` interface using Gmail/Google APIs
  - [x] 2.8 Implement `UnifiedInboxService` (`services/unified-inbox.ts`): poll all active adapters, normalize to `StandardEmail`, tag with `source`, merge timelines by timestamp
  - [x] 2.9 Implement `SmartDraftService` (`services/smart-draft.ts`): route replies to original thread's source, default new drafts to Outlook, Dev Mode fallback to Gmail
  - [x] 2.10 Implement `calendar-sync.ts`: fetch calendar events from both providers via adapters, normalize to `CalendarEvent`
  - [x] 2.11 Implement `contacts-sync.ts`: fetch contacts/directory for VIP suggestions from both providers
  - [x] 2.12 Implement sync status tracking: expose sync state per adapter (syncing, synced, error), handle partial failures gracefully

- [ ] **3.0 Intelligence Layer — Three-Tier Memory Stack**

  **Tier 1: Ephemeral (In-Memory Processing)**
  - [x] 3.1 Implement `keyword-matcher.ts`: match emails against user-defined keywords and default red-flag patterns (regex + fuzzy)
  - [x] 3.2 Implement `vip-detector.ts`: check sender against VIP list, infer importance from interaction frequency
  - [x] 3.3 Implement `thread-velocity.ts`: calculate reply frequency, detect escalation language, identify high-velocity threads
  - [x] 3.4 Implement `calendar-proximity.ts`: score emails by relevance to upcoming calendar events
  - [x] 3.5 Implement `default-patterns.ts`: ship default red-flag keywords ("urgent", "ASAP", "incident", "outage", "escalation", "deadline", etc.)
  - [x] 3.6 Implement `scorer.ts`: combine all signals into composite Red Flag score per email/thread
  - [x] 3.7 Implement `topic-clusterer.ts`: cluster emails by topic/project using thread IDs, subject normalization, semantic similarity

  **Tier 2: Session State (Redis)**
  - [x] 3.8 Provision Redis instance (local Docker + cloud for prod)
  - [x] 3.9 Define `DriveState` type: `{ sessionId, currentTopicIndex, currentItemIndex, itemsRemaining, interruptStatus, lastPosition, startedAt, updatedAt }`
  - [x] 3.10 Implement `RedisSessionStore` (`session/redis-session-store.ts`): CRUD operations for `DriveState`, TTL-based expiration (24h)
  - [x] 3.11 Implement `ShadowProcessor` (`session/shadow-processor.ts`): background service that listens to LiveKit transcript events, updates Redis state in real-time ("Ack & Act" pattern)

  **Tier 3: Knowledge Base (Supabase Vector)**
  - [x] 3.12 Provision Supabase project with pgvector extension enabled
  - [x] 3.13 Design vector store schema: `documents` table (id, content, embedding, metadata: {asset_id, category, location, source_file}, source_type: 'ASSET' | 'SAFETY_MANUAL' | 'PROCEDURE')
  - [x] 3.14 Implement `SupabaseVectorStore` (`knowledge/supabase-vector-store.ts`): upsert, query, delete operations with filtering by source_type

  **Asset Data Sources — Where the Data Comes From**
  - [x] 3.15 Define `Asset` schema type: `{ assetId: string (e.g., "P-104"), name: string, description: string, category: string, location: string, metadata: Record<string, string> }`
  - [x] 3.16 Create MVP seed data file (`seed-assets.json`): hardcode 20-50 sample NCE Asset IDs with descriptions for development/testing — **THIS IS THE STARTING POINT**
  - [x] 3.17 Create MVP seed data file (`seed-safety-manuals.json`): hardcode 5-10 safety manual excerpts (title, section, content) for development/testing
  - [ ] 3.18 Implement `csv-parser.ts`: parse CSV file with columns `[AssetID, Name, Description, Category, Location, ...]`, validate required fields, return `Asset[]`
  - [ ] 3.19 Implement `pdf-extractor.ts`: extract text from Safety Manual PDFs using `pdf-parse`, chunk into ~500 token segments with overlap
  - [ ] 3.20 Implement `AssetIngestion` (`asset-ingestion.ts`): orchestrator that accepts source type ('seed' | 'csv' | 'pdf'), loads data via appropriate parser, generates embeddings (OpenAI ada-002), upserts to Supabase
  - [ ] 3.21 Implement CLI `ingest-assets`: `npx ts-node cli/ingest-assets.ts --source seed` (MVP) or `--source csv --file ./data/assets.csv` (production)
  - [ ] 3.22 Implement CLI `ingest-manuals`: `npx ts-node cli/ingest-manuals.ts --source seed` (MVP) or `--source pdf --dir ./data/manuals/` (production)
  - [ ] 3.23 Implement CLI `list-assets`: verify ingested assets, show count by source_type
  - [ ] 3.24 Document expected CSV format in README: provide `assets-template.csv` with example rows

  **RAG Retrieval**
  - [ ] 3.25 Implement `RAGRetriever` (`knowledge/rag-retriever.ts`): semantic search for contextual grounding, filter by source_type, return top-k with scores

  **Briefing & Summarization**
  - [ ] 3.26 Implement `llm-client.ts`: GPT-4o API integration with retry, rate limiting, streaming support
  - [ ] 3.27 Implement `email-summarizer.ts`: generate concise summaries of email threads
  - [ ] 3.28 Implement `narrative-generator.ts`: convert clusters + red flags + summaries into podcast-style briefing script
  - [ ] 3.29 Implement `explanation-generator.ts`: generate "why this is a red flag" explanations

  **Personalization**
  - [ ] 3.30 Implement `preferences-store.ts`: encrypted local + synced storage for VIPs, keywords, topics, muted senders
  - [ ] 3.31 Implement `feedback-learner.ts`: process user feedback to adjust scoring over time

- [ ] **4.0 Voice Interface — LiveKit Voice Stack**

  **LiveKit Cloud Setup**
  - [ ] 4.1 Provision LiveKit Cloud project, obtain API Key and Secret
  - [ ] 4.2 Configure LiveKit project settings: room defaults, codec preferences, region selection
  - [ ] 4.3 Set up LiveKit webhook endpoint for room events (participant joined/left, track published)

  **LiveKit Backend Agent**
  - [ ] 4.4 Initialize `packages/livekit-agent` package (Node.js or Python with `livekit-agents` SDK)
  - [ ] 4.5 Implement `agent.ts`: LiveKit Agent that joins room, manages audio tracks, handles participant lifecycle
  - [ ] 4.6 Implement agent auto-scaling: deploy as containerized service, scale based on active rooms
  - [ ] 4.7 Create `Dockerfile` for agent deployment (LiveKit Agents framework)

  **Speech-to-Text (Deepgram Nova-2)**
  - [ ] 4.8 Configure Deepgram Nova-2 integration via LiveKit STT plugin
  - [ ] 4.9 Implement custom vocabulary for domain terms: NCE Asset IDs (P-104, P-205), project names, VIP names
  - [ ] 4.10 Configure accent/language support: en-US (default), en-GB, en-IN, en-AU via Deepgram model selection
  - [ ] 4.11 Implement interim results handling for responsive UX

  **Text-to-Speech (ElevenLabs Turbo)**
  - [ ] 4.12 Configure ElevenLabs Turbo v2.5 integration via LiveKit TTS plugin
  - [ ] 4.13 Select/configure voice: professional, clear, appropriate pacing for in-motion listening
  - [ ] 4.14 Implement streaming TTS for low-latency briefing playback

  **GPT-4o Reasoning Loop**
  - [ ] 4.15 Implement `reasoning-loop.ts`: orchestrate STT transcript → GPT-4o → TTS response cycle
  - [ ] 4.16 Define system prompt (`prompts/system-prompt.ts`): persona (executive assistant), safety constraints, tool usage instructions
  - [ ] 4.17 Define briefing prompts (`prompts/briefing-prompts.ts`): templates for topic transitions, summaries, red-flag callouts
  - [ ] 4.18 Implement function tools for email actions (`tools/email-tools.ts`): `mute_sender`, `prioritize_vip`, `create_folder`, `move_emails`, `mark_read`, `flag_followup`, `create_draft`, `search_emails`, `undo_last_action`
  - [ ] 4.19 Implement function tools for navigation (`tools/navigation-tools.ts`): `skip_topic`, `next_item`, `go_back`, `repeat_that`, `go_deeper`, `pause_briefing`, `resume_briefing`, `stop_briefing`
  - [ ] 4.20 Implement confirmation verbosity logic in reasoning loop: Low risk → "Done", Medium → action+count, High → confirm before execute
  - [ ] 4.21 Implement disambiguation handling: when GPT-4o detects ambiguity, prompt user with top 2-3 options
  - [ ] 4.22 Connect reasoning loop to `ShadowProcessor` for real-time state updates

  **Barge-in & Interruption (LiveKit Native)**
  - [ ] 4.23 Configure LiveKit agent for barge-in: agent listens while speaking, detects user speech via VAD
  - [ ] 4.24 Implement interrupt handling: on user speech detection, pause TTS, process user input, decide resume/new-response

- [ ] **5.0 Mobile App — LiveKit Integration**

  **Project Setup**
  - [ ] 5.1 Initialize React Native project with TypeScript, configure navigation (React Navigation), link shared packages
  - [ ] 5.2 Install and configure `@livekit/react-native` SDK
  - [ ] 5.3 Implement `livekit-token.ts`: service to fetch room access token from backend API

  **Onboarding Screens**
  - [ ] 5.4 Implement `Welcome.tsx`: splash screen with value proposition, "Quick Start" and "Personalize" buttons
  - [ ] 5.5 Implement `ConnectAccount.tsx`: OAuth buttons for Outlook and Gmail, loading state during sync, success/error feedback
  - [ ] 5.6 Implement `VIPSelection.tsx`: display suggested contacts (8-12), toggle VIP status, search/add, "Skip for now"
  - [ ] 5.7 Implement `TopicSelection.tsx`: display suggested topic chips (6-10), tap to select/deselect, manual add, "Skip for now"
  - [ ] 5.8 Implement `KeywordSelection.tsx`: display default + suggested keywords, tap to select/deselect, manual add, "Skip for now"
  - [ ] 5.9 Implement `Confirmation.tsx`: display summary of VIPs, topics, keywords; "Start My First Briefing" button

  **Briefing Room (LiveKit)**
  - [ ] 5.10 Implement `LiveKitRoom.tsx`: wrapper component using `@livekit/react-native` `LiveKitRoom`, `RoomAudioRenderer`
  - [ ] 5.11 Implement `BriefingRoom.tsx`: main briefing UI with LiveKit room connection, minimal in-motion controls
  - [ ] 5.12 Implement `useLiveKitRoom.ts`: hook for connecting to room, handling connection state, auto-reconnect
  - [ ] 5.13 Implement `PTTButton.tsx`: push-to-talk that sends data message to agent (or enables mic track)
  - [ ] 5.14 Implement visual feedback for agent speaking vs listening state

  **Dead Zone Handling (Network Resilience)**
  - [ ] 5.15 Implement `useConnectionQuality.ts`: hook that subscribes to LiveKit `ConnectionQuality` events
  - [ ] 5.16 Implement dead zone handling: on `ConnectionQuality.Poor` or `Lost`, show "Connection lost" overlay, pause UI
  - [ ] 5.17 Implement auto-resume: on `ConnectionQuality.Good` restoration, reconnect to room, resume briefing from last position (via Redis state)
  - [ ] 5.18 Implement `ConnectionQualityIndicator.tsx`: visual indicator (green/yellow/red) for real-time quality

  **Settings & Utilities**
  - [ ] 5.19 Implement `Settings.tsx`: manage VIPs, keywords, topics, muted senders, verbosity preference, language variant
  - [ ] 5.20 Implement `PrivacyDashboard.tsx`: show stored data, retention periods, "Clear My Data" button, link to revoke permissions
  - [ ] 5.21 Implement `PendingActions.tsx`: list of queued commands (failed due to network), retry button, clear option
  - [ ] 5.22 Implement `SyncStatus.tsx`: indicator showing sync state (syncing, synced, error), tap for details
  - [ ] 5.23 Implement `useNetworkStatus.ts`: hook monitoring device connectivity, triggering offline queue sync on reconnect
  - [ ] 5.24 Implement `offline-queue.ts`: queue failed commands, persist to storage, retry on connectivity restore, max 3 retries
  - [ ] 5.25 Implement quiet mode: reduce/disable notifications, accessible via voice ("quiet mode on/off")
  - [ ] 5.26 Implement emergency stop: "stop" / "cancel" voice command (handled by agent) halts briefing
  - [ ] 5.27 Implement second account connection flow: mini-onboarding for adding Outlook/Gmail after initial setup

- [ ] **6.0 Desktop App — Drafts Review, Audit Trail, Settings Sync**
  - [ ] 6.1 Initialize Electron project with React renderer, TypeScript, link shared packages
  - [ ] 6.2 Implement OAuth flows for desktop: deep link handling or browser redirect for Outlook and Gmail
  - [ ] 6.3 Implement `DraftsList.tsx`: list "Drafts Pending Review" with filters (topic, sender, urgency, source), draft count badge
  - [ ] 6.4 Implement `DraftCard.tsx`: draft preview (recipient, subject snippet, red-flag indicator, source badge, created date)
  - [ ] 6.5 Implement `DraftDetail.tsx`: full draft content, original thread context, red-flag rationale, edit capability, "Approve & Send" button
  - [ ] 6.6 Implement draft editing: rich text editor for modifying draft before sending
  - [ ] 6.7 Implement "Approve & Send": user-initiated send via appropriate adapter (based on `source`), confirmation dialog, success/error feedback
  - [ ] 6.8 Implement `SessionActivity.tsx`: per-session audit log showing all actions (timestamp, action, target, outcome)
  - [ ] 6.9 Implement `AllActivity.tsx`: filterable history of all sessions, date range picker, action type filter
  - [ ] 6.10 Implement `ActivityRow.tsx`: single audit entry display with undo button (if applicable)
  - [ ] 6.11 Implement `UndoButton.tsx`: trigger undo for individual or batch-selected actions, confirmation dialog
  - [ ] 6.12 Implement batch undo: select multiple actions in activity view, undo all at once (within 24-hour window)
  - [ ] 6.13 Implement `audit-trail.ts`: store audit entries (encrypted), 30-day default retention, configurable
  - [ ] 6.14 Implement `export.ts`: export audit trail to CSV and JSON formats, file save dialog
  - [ ] 6.15 Implement `Settings.tsx`: mirror mobile settings (VIPs, keywords, verbosity), sync status
  - [ ] 6.16 Implement `PrivacyDashboard.tsx`: mirror mobile privacy dashboard
  - [ ] 6.17 Implement `draft-sync.ts`: sync draft references between mobile and desktop, real-time updates via API
  - [ ] 6.18 Implement `preferences-sync.ts`: sync user preferences between mobile and desktop (conflict resolution: last-write-wins)

- [ ] **7.0 Backend API**
  - [ ] 7.1 Initialize `apps/api` with Express or Fastify, TypeScript
  - [ ] 7.2 Implement `/auth/microsoft/callback` and `/auth/google/callback` OAuth callback routes
  - [ ] 7.3 Implement `/livekit/token` endpoint: generate room access tokens for authenticated users
  - [ ] 7.4 Implement `/sync/drafts` endpoint: CRUD for draft references, source tracking
  - [ ] 7.5 Implement `/sync/preferences` endpoint: sync user preferences (VIPs, keywords, etc.)
  - [ ] 7.6 Implement `/webhooks/livekit` endpoint: handle LiveKit room events for analytics/logging
  - [ ] 7.7 Implement JWT authentication middleware for all protected routes
  - [ ] 7.8 Create `Dockerfile` for API deployment

---

## Deleted Tasks (Obsolete — Replaced by LiveKit)

The following tasks from the original plan have been **removed** as they are now handled by the LiveKit Voice Stack:

| Original Task | Reason for Deletion |
|---------------|---------------------|
| 4.1 ASR service integration (custom) | Replaced by Deepgram Nova-2 via LiveKit STT plugin |
| 4.2 Accent configuration (custom) | Handled by Deepgram model selection |
| 4.3 TTS service integration (custom) | Replaced by ElevenLabs Turbo via LiveKit TTS plugin |
| 4.4 Push-to-talk (custom audio) | Simplified to data message / mic toggle via LiveKit SDK |
| 4.5 Wake word detector | Out of scope for MVP; can add later via dedicated wake word service |
| 4.6 Always-listening mode | Out of scope for MVP; LiveKit VAD provides detection during session |
| 4.7 Barge-in controller (custom) | **DELETED** — LiveKit agent handles barge-in natively via VAD |
| 4.8 Audio buffer (custom) | **DELETED** — LiveKit handles audio buffering and network resilience |
| 4.9 Intent parser (custom) | **DELETED** — GPT-4o reasoning loop handles intent parsing |
| 4.10 Disambiguator (custom) | Moved into GPT-4o reasoning loop |
| 4.11 Compound parser (custom) | Moved into GPT-4o reasoning loop |
| 4.12 Command definitions (custom) | Replaced by function tool definitions for GPT-4o |
| 4.13 Command executor (custom) | Replaced by function tool execution in reasoning loop |
| 4.14 Confirmation verbosity (custom) | Implemented in GPT-4o system prompt + reasoning loop |
| 4.15 Error recovery prompts (custom) | Handled by GPT-4o persona + system prompt |
| 5.8 BriefingPlayer (custom audio) | Replaced by LiveKit-based `BriefingRoom` |
| 5.9 PTTButton (custom audio hooks) | Simplified to LiveKit data message / mic toggle |
| 5.10 ListeningIndicator (custom) | Replaced by LiveKit agent state tracking |
| 5.15-5.18 useVoiceCommands, useBriefing (custom hooks) | Replaced by `useLiveKitRoom` and agent-driven flow |

---

## Definition of Done

Each task is complete when:
1. Code is implemented and follows project conventions
2. Unit tests pass with reasonable coverage (>80% for critical paths)
3. No TypeScript errors or ESLint warnings
4. Code is reviewed and merged to main branch
5. Feature works end-to-end in development environment
6. For LiveKit tasks: tested with actual LiveKit Cloud connection
