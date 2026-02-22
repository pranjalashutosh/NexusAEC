# Nexus AEC - Project Context Document

**Generated:** 2026-01-09 **Status:** Phase 1 Complete (Foundation), Phase 2 In
Progress

---

## 1. Project Overview

### 1.1 Vision & Goals

**Nexus AEC** is a voice-driven AI executive assistant designed for
professionals who need to stay on top of critical communications while on the go
(e.g., driving, commuting, exercising). The system provides:

- **Unified Inbox Management**: Aggregates emails from both Outlook and Gmail
  into a single timeline
- **Intelligent Prioritization**: Uses AI to detect "red flags" (urgent emails,
  VIP senders, time-sensitive threads)
- **Voice-First Interface**: Enables hands-free email management through natural
  voice commands
- **Safety & Privacy**: Built with enterprise-grade encryption, secure storage,
  and transparent audit trails

### 1.2 Core Architecture: Unified LiveKit Voice Stack

The system uses **LiveKit Cloud** as the central hub for all voice interactions,
eliminating the need for custom audio processing:

```
┌─────────────┐     LiveKit      ┌──────────────────┐
│   Mobile    │ ◄──────────────► │  Backend Agent   │
│     App     │   WebRTC Audio   │  (Node.js)       │
└─────────────┘                  └──────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  │                       │                       │
           ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
           │  Deepgram   │        │   GPT-4o    │        │ ElevenLabs  │
           │  Nova-2 STT │        │  Reasoning  │        │  Turbo TTS  │
           └─────────────┘        └─────────────┘        └─────────────┘
```

**Key Components:**

- **Mobile App**: React Native with `@livekit/react-native` SDK
- **Backend Agent**: LiveKit Agents framework (Node.js/Python)
- **Speech-to-Text**: Deepgram Nova-2 via LiveKit STT plugin
- **Text-to-Speech**: ElevenLabs Turbo v2.5 via LiveKit TTS plugin
- **Reasoning**: GPT-4o with function calling for email actions

### 1.3 Three-Tier Memory Architecture

1. **Tier 1: Ephemeral (In-Memory)**
   - Red flag scoring
   - Topic clustering
   - Real-time email analysis

2. **Tier 2: Session State (Redis)**
   - Live "Drive State" tracking (current position, interrupts)
   - Shadow processor for real-time transcript updates
   - TTL-based expiration (24 hours)

3. **Tier 3: Knowledge Base (Supabase Vector)**
   - Asset data (NCE Asset IDs, descriptions)
   - Safety manual excerpts
   - RAG retrieval for contextual grounding

---

## 2. Technology Stack

### 2.1 Monorepo Structure

- **Package Manager**: pnpm 9.0.0
- **Build System**: Turborepo 2.0
- **Language**: TypeScript 5.4+ (strict mode)
- **Testing**: Jest 29.7
- **Linting**: ESLint 8.57 + Prettier 3.2

### 2.2 Key Technologies

| Layer              | Technology                 | Purpose                                     |
| ------------------ | -------------------------- | ------------------------------------------- |
| **Voice**          | LiveKit Cloud              | Real-time audio/video infrastructure        |
| **STT**            | Deepgram Nova-2            | Speech recognition with custom vocabulary   |
| **TTS**            | ElevenLabs Turbo v2.5      | Natural voice synthesis                     |
| **AI**             | OpenAI GPT-4o              | Reasoning, intent parsing, function calling |
| **Email**          | Microsoft Graph API        | Outlook integration                         |
| **Email**          | Google Gmail API           | Gmail integration                           |
| **Session State**  | Redis 7                    | In-memory session tracking                  |
| **Vector Store**   | Supabase (pgvector)        | Knowledge base embeddings                   |
| **Mobile**         | React Native               | Cross-platform mobile app                   |
| **Desktop**        | Electron + React           | Desktop app for draft review                |
| **Backend**        | Express/Fastify            | API server                                  |
| **Infrastructure** | Docker Compose, Kubernetes | Local dev + production deployment           |

### 2.3 Development Environment

```bash
# Start infrastructure (Redis + PostgreSQL + pgvector)
pnpm infra:up

# Start with management UIs (Redis Commander + pgAdmin)
pnpm infra:up:tools

# Development
pnpm dev          # Run all packages in watch mode
pnpm test         # Run all tests
pnpm lint         # Lint all packages
pnpm type-check   # TypeScript type checking
```

---

## 3. What's Been Completed

### ✅ Phase 1: Project Foundation & Infrastructure (100% Complete)

**Tasks 1.1 - 1.11 (All Complete)**

#### Implemented Components:

1. **Monorepo Setup**
   - ✅ Turborepo configuration (`turbo.json`)
   - ✅ pnpm workspaces (`package.json`)
   - ✅ Shared TypeScript config (`tsconfig.base.json`)
   - ✅ ESLint + Prettier configuration
   - ✅ CI/CD pipeline (`.github/workflows/ci.yml`)

2. **Shared Packages** (`packages/`)

   **`@nexus-aec/shared-types`**
   - ✅ Comprehensive type definitions (290 lines)
   - ✅ Types: `StandardEmail`, `StandardThread`, `StandardDraft`,
     `CalendarEvent`, `Contact`, `RedFlag`, `VIP`, `Topic`, `DriveState`,
     `AuditEntry`, `UserPreferences`, `Asset`, `VectorDocument`
   - ✅ Full coverage of domain models

   **`@nexus-aec/encryption`**
   - ✅ AES-256 encryption/decryption utilities
   - ✅ Key derivation functions
   - ✅ Unit tests

   **`@nexus-aec/secure-storage`**
   - ✅ Platform-agnostic abstraction
   - ✅ Support for Keychain (iOS/macOS), EncryptedSharedPreferences (Android),
     Credential Manager (Windows)
   - ✅ Unit tests

   **`@nexus-aec/logger`**
   - ✅ Structured logging with PII filtering
   - ✅ Log levels (debug, info, warn, error)
   - ✅ Unit tests

3. **Local Development Infrastructure** (`infra/`)
   - ✅ Docker Compose configuration
   - ✅ Redis 7 container (port 6379)
   - ✅ PostgreSQL 16 + pgvector container (port 5432)
   - ✅ Database initialization script (`init-db.sql`)
   - ✅ Optional management UIs (Redis Commander, pgAdmin)
   - ✅ Health checks and restart policies

4. **Environment Configuration**
   - ✅ Comprehensive `.env.example` (181 lines)
   - ✅ All required variables documented:
     - LiveKit Cloud credentials
     - Supabase/PostgreSQL connection
     - Redis URL
     - OpenAI API key (GPT-4o + embeddings)
     - Deepgram API key (Nova-2)
     - ElevenLabs API key (Turbo v2.5)
     - Microsoft Graph OAuth
     - Google OAuth
     - Encryption keys
     - Feature flags

### ✅ Phase 2: Email Provider Integration (100% Complete)

**Tasks 2.1 - 2.12 (All Complete)**

#### Implemented Components:

**`@nexus-aec/email-providers`** - Complete unified adapter pattern

1. **Interfaces & Types** (`src/interfaces/`)
   - ✅ `EmailProvider` interface (477 lines of comprehensive types)
   - ✅ Common methods: `fetchThreads()`, `fetchUnread()`, `createDraft()`,
     `sendDraft()`, `markRead()`, `markUnread()`, `moveToFolder()`,
     `applyLabel()`, `getContacts()`, `getCalendarEvents()`
   - ✅ `StandardEmail`, `StandardThread`, `StandardDraft`, `CalendarEvent`,
     `Contact` types
   - ✅ `EmailSource` discriminator (`'OUTLOOK' | 'GMAIL'`)
   - ✅ Pagination, filtering, and sync status types
   - ✅ Unit tests for interface compliance

2. **OAuth Implementation** (`src/oauth/`)
   - ✅ `microsoft.ts`: OAuth 2.0 with PKCE for Microsoft Graph
   - ✅ `google.ts`: OAuth 2.0 with PKCE for Google APIs
   - ✅ `token-manager.ts`: Secure token storage, automatic refresh, expiration
     handling
   - ✅ Comprehensive unit tests for all OAuth flows

3. **Provider Adapters** (`src/adapters/`)
   - ✅ `OutlookAdapter`: Full implementation using Microsoft Graph API
   - ✅ `GmailAdapter`: Full implementation using Gmail/Google APIs
   - ✅ Both implement `EmailProvider` interface
   - ✅ Comprehensive unit tests

4. **Services** (`src/services/`)
   - ✅ `UnifiedInboxService`: Polls all adapters, normalizes, merges by
     timestamp
   - ✅ `SmartDraftService`: Routes replies to original source, defaults to
     Outlook
   - ✅ `calendar-sync.ts`: Fetches events from both providers
   - ✅ `contacts-sync.ts`: Fetches contacts for VIP suggestions
   - ✅ Unit tests for all services

5. **Sync Status Tracking**
   - ✅ Per-adapter sync state (syncing, synced, error)
   - ✅ Graceful partial failure handling
   - ✅ Last sync timestamp tracking

---

## 4. What Remains to Be Built

### 🔨 Phase 3: Intelligence Layer (0% Complete)

**Tasks 3.1 - 3.31**

#### Tier 1: Ephemeral Processing (Not Started)

- ⬜ 3.1-3.5: Red flag detection components
  - `keyword-matcher.ts`
  - `vip-detector.ts`
  - `thread-velocity.ts`
  - `calendar-proximity.ts`
  - `default-patterns.ts`
- ⬜ 3.6: `scorer.ts` - Composite red flag scoring
- ⬜ 3.7: `topic-clusterer.ts` - Email clustering

#### Tier 2: Session State (Not Started)

- ⬜ 3.8-3.9: Redis setup and `DriveState` schema
- ⬜ 3.10: `RedisSessionStore` implementation
- ⬜ 3.11: `ShadowProcessor` - Real-time transcript → state updates

#### Tier 3: Knowledge Base (Not Started)

- ⬜ 3.12-3.14: Supabase vector store setup and implementation
- ⬜ 3.15-3.24: Asset data ingestion system
  - Seed data files (MVP: hardcoded 20-50 assets)
  - CSV parser for production data
  - PDF extractor for safety manuals
  - CLI tools for ingestion
- ⬜ 3.25: RAG retrieval implementation

#### Briefing & Summarization (Not Started)

- ⬜ 3.26-3.29: LLM integration for briefings
  - `llm-client.ts`
  - `email-summarizer.ts`
  - `narrative-generator.ts`
  - `explanation-generator.ts`

#### Personalization (Not Started)

- ⬜ 3.30-3.31: User preferences and learning
  - `preferences-store.ts`
  - `feedback-learner.ts`

### 🔨 Phase 4: Voice Interface - LiveKit Stack (0% Complete)

**Tasks 4.1 - 4.24**

#### LiveKit Setup (Not Started)

- ⬜ 4.1-4.3: LiveKit Cloud project provisioning
- ⬜ 4.4-4.7: Backend agent implementation

#### STT Configuration (Not Started)

- ⬜ 4.8-4.11: Deepgram Nova-2 integration
  - Custom vocabulary (Asset IDs, project names)
  - Accent/language support
  - Interim results handling

#### TTS Configuration (Not Started)

- ⬜ 4.12-4.14: ElevenLabs Turbo v2.5 integration
  - Voice selection
  - Streaming TTS

#### GPT-4o Reasoning Loop (Not Started)

- ⬜ 4.15-4.22: Reasoning loop and tool definitions
  - System prompts
  - Email action tools
  - Navigation tools
  - Confirmation verbosity logic
  - Disambiguation handling

#### Barge-in & Interruption (Not Started)

- ⬜ 4.23-4.24: LiveKit native barge-in handling

### 🔨 Phase 5: Mobile App (0% Complete)

**Tasks 5.1 - 5.27**

**Status**: `apps/mobile/` directory is empty

#### Project Setup (Not Started)

- ⬜ 5.1-5.3: React Native initialization + LiveKit SDK

#### Onboarding Screens (Not Started)

- ⬜ 5.4-5.9: Welcome, OAuth, VIP/Topic/Keyword selection, Confirmation

#### Briefing Room (Not Started)

- ⬜ 5.10-5.14: LiveKit room integration, PTT button, state management

#### Dead Zone Handling (Not Started)

- ⬜ 5.15-5.18: Connection quality monitoring, auto-resume

#### Settings & Utilities (Not Started)

- ⬜ 5.19-5.27: Settings, privacy dashboard, offline queue, quiet mode

### 🔨 Phase 6: Desktop App (0% Complete)

**Tasks 6.1 - 6.18**

**Status**: `apps/desktop/` directory is empty

#### Draft Review (Not Started)

- ⬜ 6.1-6.7: Electron setup, draft list/detail views, approve & send

#### Audit Trail (Not Started)

- ⬜ 6.8-6.14: Session activity, all activity, undo, export

#### Settings & Sync (Not Started)

- ⬜ 6.15-6.18: Settings, privacy dashboard, draft sync, preferences sync

### 🔨 Phase 7: Backend API (0% Complete)

**Tasks 7.1 - 7.8**

**Status**: `apps/api/` directory is empty

#### Implementation (Not Started)

- ⬜ 7.1-7.8: Express/Fastify setup, OAuth callbacks, LiveKit token generation,
  sync endpoints, webhooks, JWT auth, Docker image

---

## 5. Key Dependencies & Integration Points

### 5.1 External Services

| Service             | Purpose                       | Status         | Priority     |
| ------------------- | ----------------------------- | -------------- | ------------ |
| **LiveKit Cloud**   | Real-time voice communication | Not configured | **Critical** |
| **Deepgram**        | Speech-to-text (Nova-2)       | Not configured | **Critical** |
| **ElevenLabs**      | Text-to-speech (Turbo v2.5)   | Not configured | **Critical** |
| **OpenAI**          | GPT-4o reasoning + embeddings | Not configured | **Critical** |
| **Microsoft Azure** | Outlook OAuth + Graph API     | Not configured | **Critical** |
| **Google Cloud**    | Gmail OAuth + APIs            | Not configured | **Critical** |
| **Supabase**        | PostgreSQL + pgvector         | Local only     | High         |
| **Redis**           | Session state storage         | Local only     | High         |

### 5.2 Critical Integration Points

#### A. Email Provider ↔ Intelligence Layer

- **Input**: `StandardEmail[]` from `UnifiedInboxService`
- **Output**: `RedFlag[]` from scoring system
- **Status**: ✅ Email providers ready, ⬜ Intelligence layer not started

#### B. Intelligence Layer ↔ LiveKit Agent

- **Input**: Red flags + clustered topics
- **Output**: Briefing script for TTS
- **Status**: ⬜ Not implemented

#### C. LiveKit Agent ↔ Mobile App

- **Transport**: WebRTC via LiveKit SDK
- **Auth**: Room tokens from backend API
- **Status**: ⬜ Not implemented

#### D. Mobile App ↔ Backend API

- **Endpoints**: OAuth callbacks, token generation, sync
- **Auth**: JWT tokens
- **Status**: ⬜ Not implemented

#### E. Desktop App ↔ Backend API

- **Purpose**: Draft sync, preferences sync
- **Status**: ⬜ Not implemented

### 5.3 Data Flow

```
User Voice Input
    │
    ├─► Mobile App (React Native)
    │       │
    │       ├─► LiveKit Room (WebRTC)
    │       │       │
    │       │       ├─► Deepgram (STT) → Transcript
    │       │       │       │
    │       │       │       ├─► GPT-4o Reasoning Loop
    │       │       │       │       │
    │       │       │       │       ├─► Email Action Tools
    │       │       │       │       │       │
    │       │       │       │       │       ├─► UnifiedInboxService
    │       │       │       │       │       │       │
    │       │       │       │       │       │       ├─► OutlookAdapter / GmailAdapter
    │       │       │       │       │       │       │
    │       │       │       │       │       ├─► Shadow Processor → Redis (Drive State)
    │       │       │       │       │
    │       │       │       │       ├─► TTS Response
    │       │       │       │               │
    │       │       │       ├─────────────► ElevenLabs (TTS) → Audio
    │       │       │                       │
    │       │       └───────────────────────┴─► Mobile App (Playback)
    │
    └─► Desktop App (Electron) - Draft Review & Audit Trail
```

---

## 6. Development Roadmap

### 6.1 Immediate Next Steps (Priority 1)

1. **Intelligence Layer - Red Flag Detection** (Tasks 3.1-3.7)
   - Start with `default-patterns.ts` (default keywords)
   - Implement `keyword-matcher.ts`
   - Build `scorer.ts` for composite scoring
   - **Rationale**: Core AI functionality needed before voice interface

2. **LiveKit Backend Agent** (Tasks 4.4-4.7)
   - Initialize `packages/livekit-agent`
   - Set up LiveKit Cloud account
   - Implement basic agent room connection
   - **Rationale**: Foundation for all voice features

3. **GPT-4o Reasoning Loop** (Tasks 4.15-4.19)
   - Implement `reasoning-loop.ts`
   - Define function tools for email actions
   - Integrate with email providers
   - **Rationale**: Critical for voice command processing

### 6.2 Phase 2 Priorities (After Phase 1)

4. **Session State - Redis** (Tasks 3.8-3.11)
   - Implement `RedisSessionStore`
   - Build `ShadowProcessor` for real-time updates
   - **Rationale**: Enables stateful voice interactions

5. **Mobile App Foundation** (Tasks 5.1-5.3, 5.10-5.14)
   - Initialize React Native project
   - Integrate LiveKit SDK
   - Build basic briefing room UI
   - **Rationale**: First user-facing interface

6. **Backend API** (Tasks 7.1-7.7)
   - Set up Express/Fastify server
   - Implement OAuth callbacks
   - Build LiveKit token endpoint
   - **Rationale**: Required for mobile app

### 6.3 Phase 3 Priorities (MVP Completion)

7. **Mobile App Onboarding** (Tasks 5.4-5.9)
   - OAuth connection screens
   - VIP/Topic/Keyword selection
   - **Rationale**: User setup flow

8. **Knowledge Base - Asset Data** (Tasks 3.12-3.24)
   - Set up Supabase vector store
   - Create seed data files
   - Implement ingestion CLI
   - **Rationale**: Domain-specific intelligence

9. **Desktop App - Draft Review** (Tasks 6.1-6.7)
   - Initialize Electron project
   - Build draft list/detail views
   - **Rationale**: Critical safety feature

### 6.4 Phase 4 Priorities (Post-MVP)

10. **Briefing & Summarization** (Tasks 3.26-3.29)
11. **Personalization & Learning** (Tasks 3.30-3.31)
12. **Mobile App Advanced Features** (Tasks 5.15-5.27)
13. **Desktop App Audit Trail** (Tasks 6.8-6.18)

---

## 7. Testing & Quality Assurance

### 7.1 Current Test Coverage

**Packages with Tests:**

- ✅ `@nexus-aec/encryption` - Unit tests present
- ✅ `@nexus-aec/logger` - Unit tests present
- ✅ `@nexus-aec/secure-storage` - Unit tests present
- ✅ `@nexus-aec/email-providers` - Comprehensive unit tests for all components

**Coverage Standards:**

- Target: >80% for critical paths
- Current: Foundation packages have basic tests
- TODO: Add integration tests for email providers

### 7.2 CI/CD Pipeline

**Current Setup** (`.github/workflows/ci.yml`):

- ✅ Lint (ESLint + Prettier)
- ✅ Type check (TypeScript)
- ✅ Unit tests (Jest)
- ✅ Build (Turborepo)
- ⬜ LiveKit Agent deployment (placeholder)

**Future Enhancements:**

- End-to-end tests (Playwright/Detox)
- Load testing for LiveKit Agent
- Security scanning (Snyk, Dependabot)

---

## 8. Security & Privacy

### 8.1 Security Measures Implemented

- ✅ AES-256 encryption for sensitive data
- ✅ Platform-specific secure storage (Keychain, Credential Manager)
- ✅ PII filtering in logs
- ✅ OAuth 2.0 with PKCE for all external APIs

### 8.2 Security Measures Planned

- ⬜ JWT authentication for backend API
- ⬜ Encrypted audit trail storage
- ⬜ User data retention policies (default 30 days)
- ⬜ "Clear My Data" functionality
- ⬜ OAuth token revocation flow

### 8.3 Privacy Considerations

**Transparency Requirements:**

- Privacy dashboard showing stored data
- Audit trail export (CSV, JSON)
- Explicit user consent for data collection
- Clear retention period communication

**Data Minimization:**

- Email content processed ephemerally (Tier 1)
- Session state expires after 24 hours (Tier 2)
- Knowledge base only stores asset metadata (Tier 3)
- No persistent storage of email content

---

## 9. Deployment Architecture

### 9.1 Local Development

```bash
# Start infrastructure
pnpm infra:up

# Components:
# - Redis (port 6379)
# - PostgreSQL + pgvector (port 5432)
# - Redis Commander (port 8081, profile: tools)
# - pgAdmin (port 5050, profile: tools)
```

### 9.2 Production (Planned)

**Infrastructure:**

- LiveKit Cloud (managed service)
- Supabase Cloud (PostgreSQL + pgvector)
- Redis Cloud or ElastiCache
- Kubernetes for backend agent auto-scaling
- Docker containers for agent deployment

**Environments:**

- Development: Local Docker Compose
- Staging: Kubernetes cluster (cloud)
- Production: Kubernetes cluster (cloud)

---

## 10. Key Files Reference

### 10.1 Configuration Files

| File                       | Purpose                  | Status      |
| -------------------------- | ------------------------ | ----------- |
| `package.json`             | Root workspace config    | ✅ Complete |
| `turbo.json`               | Turborepo build config   | ✅ Complete |
| `tsconfig.base.json`       | Shared TypeScript config | ✅ Complete |
| `.eslintrc.js`             | ESLint rules             | ✅ Complete |
| `.prettierrc`              | Code formatting          | ✅ Complete |
| `.env.example`             | Environment variables    | ✅ Complete |
| `.github/workflows/ci.yml` | CI/CD pipeline           | ✅ Complete |

### 10.2 Key Package Files

| Package           | Key Files                           | Status      |
| ----------------- | ----------------------------------- | ----------- |
| `shared-types`    | `src/index.ts` (290 lines)          | ✅ Complete |
| `encryption`      | `src/index.ts`, `src/index.test.ts` | ✅ Complete |
| `logger`          | `src/index.ts`, `src/index.test.ts` | ✅ Complete |
| `secure-storage`  | `src/index.ts`, `src/index.test.ts` | ✅ Complete |
| `email-providers` | All files (24 TypeScript files)     | ✅ Complete |

### 10.3 Infrastructure Files

| File                       | Purpose               | Status         |
| -------------------------- | --------------------- | -------------- |
| `infra/docker-compose.yml` | Local dev environment | ✅ Complete    |
| `infra/init-db.sql`        | PostgreSQL schema     | ✅ Complete    |
| `infra/README.md`          | Infrastructure docs   | ✅ Complete    |
| `infra/k8s/`               | Kubernetes manifests  | ⬜ Not started |

---

## 11. Open Questions & Decisions Needed

### 11.1 Technical Decisions

1. **LiveKit Agent Language**: Node.js or Python?
   - Python has more mature LiveKit Agents SDK examples
   - Node.js aligns with rest of monorepo (TypeScript)
   - **Recommendation**: Start with Node.js, migrate if needed

2. **Mobile App State Management**: Zustand or Redux?
   - Zustand is simpler, Redux is more powerful
   - **Recommendation**: Zustand for MVP, Redux if complexity grows

3. **Backend Framework**: Express or Fastify?
   - Express is more mature, Fastify is faster
   - **Recommendation**: Fastify for performance

4. **Asset Data Source**: CSV or API integration?
   - MVP: Hardcoded seed files + CSV support
   - Production: API integration with client's asset management system
   - **Decision**: Start with seed files, add CSV parser, defer API

### 11.2 Product Decisions

1. **Briefing Duration**: How long should a typical briefing be?
   - Recommendation: 5-10 minutes for 20-30 emails
   - User can skip/pause/go deeper as needed

2. **Draft Approval Flow**: Always require desktop approval?
   - High-risk drafts (VIP, red flags): Always require approval
   - Low-risk drafts: Optional auto-send with audit trail
   - **Recommendation**: Always require approval for MVP

3. **VIP Auto-Suggestion**: How many contacts to suggest?
   - Based on interaction frequency + recent activity
   - **Recommendation**: 8-12 top contacts

4. **Red Flag Threshold**: What score triggers a red flag?
   - Will need tuning based on user feedback
   - **Recommendation**: Start with score > 0.7 (high severity)

---

## 12. Success Metrics (Future)

### 12.1 User Engagement

- Daily active users (DAU)
- Briefing completion rate
- Average briefing duration
- Commands per session

### 12.2 AI Performance

- Red flag detection accuracy (precision/recall)
- Draft quality (user edit rate before send)
- Voice command success rate
- Barge-in/interruption handling quality

### 12.3 System Performance

- End-to-end latency (voice input → response)
- LiveKit connection quality (uptime, packet loss)
- Email sync reliability (success rate, error rate)
- Dead zone recovery time

---

## 13. Contact & Resources

### 13.1 External Documentation

- **LiveKit**: https://docs.livekit.io
- **Deepgram Nova-2**: https://developers.deepgram.com
- **ElevenLabs Turbo**: https://elevenlabs.io/docs
- **OpenAI GPT-4o**: https://platform.openai.com/docs
- **Microsoft Graph**: https://learn.microsoft.com/en-us/graph
- **Google Gmail API**: https://developers.google.com/gmail
- **Supabase**: https://supabase.com/docs
- **React Native**: https://reactnative.dev
- **LiveKit React Native SDK**:
  https://github.com/livekit/client-sdk-react-native

### 13.2 Project Files

- **Task List**: `tasks/tasks-0001-prd-voice-exec-assistant.md`
- **PRD**: `rules/0001-prd-voice-exec-assistant.md`
- **Architecture Diagrams**: (TODO: Add diagrams)

---

## 14. Summary

### Current State

- ✅ **Foundation Complete**: Monorepo, shared packages, infrastructure
- ✅ **Email Integration Complete**: Unified adapter pattern for Outlook + Gmail
- ⬜ **Voice Interface**: Not started (critical path)
- ⬜ **Mobile/Desktop Apps**: Not started
- ⬜ **Intelligence Layer**: Not started

### Critical Path to MVP

1. Intelligence Layer (Red Flag Detection)
2. LiveKit Backend Agent + GPT-4o Reasoning Loop
3. Mobile App + Backend API
4. Desktop App (Draft Review)

### Estimated Completion

- **Phase 3 (Intelligence)**: ~2-3 weeks
- **Phase 4 (Voice)**: ~2-3 weeks
- **Phase 5 (Mobile)**: ~3-4 weeks
- **Phase 6 (Desktop)**: ~2 weeks
- **Phase 7 (Backend API)**: ~1 week

**Total MVP Timeline**: ~10-13 weeks from current state

---

_Last Updated: 2026-01-09_ _Next Review: After Phase 3 completion_
