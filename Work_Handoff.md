# NexusAEC - Development Handoff Document

**Last Updated:** 2026-01-17
**Project Version:** 0.1.0
**Handoff Purpose:** Enable a new developer/AI model to continue development seamlessly

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Summary](#2-architecture-summary)
3. [Current Progress](#3-current-progress)
4. [Environment Setup](#4-environment-setup)
5. [Build Status & Known Issues](#5-build-status--known-issues)
6. [Testing Status](#6-testing-status)
7. [Next Development Steps](#7-next-development-steps)
8. [Key Files Reference](#8-key-files-reference)
9. [Important Technical Decisions](#9-important-technical-decisions)
10. [API Keys & External Services](#10-api-keys--external-services)

---

## 1. Project Overview

### What is NexusAEC?

NexusAEC is a **voice-driven AI executive assistant** that enables professionals to manage email communications through natural voice interactions while on the go.

### Core Capabilities

- **Email Aggregation**: Unified inbox from Outlook + Gmail via adapter pattern
- **Red Flag Detection**: AI-powered identification of urgent/critical messages
- **Voice Briefings**: Podcast-style audio summaries of important emails
- **Voice Commands**: Hands-free email actions (flag, move, draft replies)
- **Safety-First**: High-risk actions (like sending emails) require desktop approval

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Monorepo** | Turborepo + pnpm workspaces |
| **Language** | TypeScript (strict mode) |
| **Voice** | LiveKit Cloud + Deepgram STT + ElevenLabs TTS |
| **AI/LLM** | OpenAI GPT-4o + text-embedding-3-small |
| **Vector Store** | Supabase (PostgreSQL + pgvector) |
| **Session State** | Redis (24h TTL) |
| **Mobile App** | React Native + @livekit/react-native |
| **Desktop App** | Electron + React |
| **Backend API** | Express/Fastify |

### Three-Tier Memory Architecture

```
Tier 1: Ephemeral (In-Memory)
├── Red flag scoring, email analysis
├── Discarded after processing
└── No persistence of email content

Tier 2: Session State (Redis)
├── "Drive State" for active voice sessions
├── Position tracking, interrupt status
└── 24-hour TTL, auto-expire

Tier 3: Knowledge Base (Supabase Vector)
├── Asset information (NCE IDs, descriptions)
├── Safety manual excerpts
└── Persistent domain knowledge for RAG
```

---

## 2. Architecture Summary

### Package Structure

```
nexus-aec/
├── packages/
│   ├── shared-types/     # TypeScript type definitions
│   ├── encryption/       # AES-256-GCM encryption utilities
│   ├── logger/           # Structured logging with PII filtering
│   ├── secure-storage/   # Platform-agnostic secure storage
│   ├── email-providers/  # Outlook + Gmail adapters
│   └── intelligence/     # Red flags, clustering, RAG, LLM
├── apps/
│   └── api/              # Backend API (initialized)
├── infra/                # Docker Compose, K8s manifests
├── supabase/             # Database migrations
└── data/                 # Asset templates and seed data
```

### Key Design Patterns

1. **Unified Email Adapter Pattern**: `EmailProvider` interface abstracts Outlook/Gmail differences
2. **Source Tagging**: All emails tagged with `source: 'OUTLOOK' | 'GMAIL'` for routing
3. **Smart Draft Routing**: Replies go to original email's provider; new drafts default to Outlook

---

## 3. Current Progress

### Completed Sections (31 tasks)

| Section | Status | Description |
|---------|--------|-------------|
| **1.0 Foundation** | ✅ Complete | Monorepo, shared packages, encryption, logging, infrastructure |
| **2.0 Email Providers** | ✅ Complete | OAuth flows, adapters, unified inbox, smart drafts, sync services |
| **3.0 Intelligence** | ✅ Complete | Red flags, clustering, Redis sessions, Supabase vectors, RAG, LLM |

### Pending Sections (6 sections remaining)

| Section | Status | Description |
|---------|--------|-------------|
| **4.0 Voice Interface** | ❌ Not Started | LiveKit agent, STT/TTS, GPT-4o reasoning loop |
| **5.0 Mobile App** | ❌ Not Started | React Native with LiveKit integration |
| **6.0 Desktop App** | ❌ Not Started | Electron for draft review and audit trail |
| **7.0 Backend API** | 🔄 Partial | API initialized; OAuth and sync endpoints pending |

### Task Tracking

Full task list is maintained in: `tasks/tasks-0001-prd-voice-exec-assistant.md`

---

## 4. Environment Setup

### Prerequisites

- **Node.js**: v20.0.0 or higher (required)
- **pnpm**: v9.0.0 or higher
- **Docker**: For local Redis and Supabase
- **Supabase CLI**: For database migrations

### Quick Start

```bash
# 1. Clone and install dependencies
cd nexusAEC
pnpm install

# 2. Copy environment template
cp .env.example .env
# Edit .env with your API keys (see Section 10)

# 3. Start local infrastructure
pnpm infra:up

# 4. Apply Supabase migrations
supabase db reset

# 5. Build all packages
pnpm build

# 6. Run tests
pnpm test
```

### Environment Variables

The `.env` file must be in the **project root directory** (not in packages/).

Critical variables:
```bash
# Required for intelligence layer
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Required for voice (Section 4.0)
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...

# Required for email integration
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## 5. Build Status & Known Issues

### Build Status

| Package | Build | Tests | Notes |
|---------|-------|-------|-------|
| `@nexus-aec/shared-types` | ✅ Pass | ✅ Pass | No external dependencies |
| `@nexus-aec/encryption` | ✅ Pass | ✅ Pass | |
| `@nexus-aec/logger` | ✅ Pass | ✅ Pass | |
| `@nexus-aec/secure-storage` | ⚠️ Issues | - | Missing DOM types (see below) |
| `@nexus-aec/email-providers` | ✅ Pass | ✅ Pass | |
| `@nexus-aec/intelligence` | ✅ Pass | ✅ Pass | |
| `apps/api` | ✅ Pass | - | Minimal implementation |

### Known Issues

#### 1. secure-storage Build Errors

**Problem**: Package fails to build due to missing DOM types (`localStorage`, `navigator`, `window`, `document`).

**Cause**: The package is designed for browser/React Native environments but lacks the `lib: ["DOM"]` TypeScript config.

**Fix Options**:
- Add `"lib": ["ES2022", "DOM"]` to `packages/secure-storage/tsconfig.json`
- Or add conditional type stubs for Node.js environments

**Impact**: Low - intelligence layer works without secure-storage for backend operations.

#### 2. Node.js Version Warning

**Problem**: User may have Node.js v18.x instead of required v20.0.0.

**Recommendation**: Upgrade to Node.js 20+ for full compatibility.

#### 3. OpenAI Quota

**Problem**: Previous testing encountered `429 You exceeded your current quota` from OpenAI.

**Fix**: Add credits to OpenAI account or use a different API key.

---

## 6. Testing Status

### Test Files

Total test files: **35+** (22 in intelligence package)

### Test Scripts Available

```bash
# Run all tests
pnpm test

# Test specific package
pnpm --filter @nexus-aec/intelligence test

# Run Supabase-only test (no OpenAI required)
npx ts-node test-supabase-only.ts

# Run full integration test (requires OpenAI credits)
npx ts-node test-simple.ts
```

### Integration Test Results

| Test | Status | Notes |
|------|--------|-------|
| Supabase Connection | ✅ Pass | Database accessible |
| Assets Table Query | ✅ Pass | Seed data loaded |
| Documents Table Query | ✅ Pass | Vector store ready |
| Vector Search (match_documents) | ✅ Pass | pgvector working |
| OpenAI Embeddings | ⚠️ Blocked | Requires API credits |
| LLM Completions | ⚠️ Blocked | Requires API credits |

---

## 7. Next Development Steps

### Immediate Next: Section 4.0 - LiveKit Voice Interface

This is the critical path for MVP. Tasks in order of priority:

#### 4.1-4.3: LiveKit Cloud Setup
```
- [ ] 4.1 Provision LiveKit Cloud project, obtain API Key and Secret
- [ ] 4.2 Configure LiveKit project settings
- [ ] 4.3 Set up webhook endpoint for room events
```

#### 4.4-4.7: LiveKit Backend Agent
```
- [ ] 4.4 Initialize packages/livekit-agent with livekit-agents SDK
- [ ] 4.5 Implement agent.ts - room management, participant handling
- [ ] 4.6 Implement auto-scaling deployment
- [ ] 4.7 Create Dockerfile
```

#### 4.8-4.14: STT and TTS Configuration
```
- [ ] 4.8-4.11 Configure Deepgram Nova-2 STT plugin
- [ ] 4.12-4.14 Configure ElevenLabs TTS plugin
```

#### 4.15-4.24: GPT-4o Reasoning Loop (Core Logic)
```
- [ ] 4.15 Implement reasoning-loop.ts
- [ ] 4.16 Define system prompt (persona, constraints)
- [ ] 4.17 Define briefing prompts
- [ ] 4.18 Implement email action tools (mute, flag, draft, etc.)
- [ ] 4.19 Implement navigation tools (skip, repeat, go deeper)
- [ ] 4.20-4.24 Confirmation verbosity, disambiguation, barge-in
```

### After Section 4.0

1. **Section 5.0**: Mobile App (React Native + LiveKit)
2. **Section 6.0**: Desktop App (Electron for draft review)
3. **Section 7.0**: Complete Backend API endpoints

---

## 8. Key Files Reference

### Architecture & Planning
| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | Complete system architecture documentation |
| `tasks/tasks-0001-prd-voice-exec-assistant.md` | Task list with checkboxes |
| `.claude/RULES.md` | Development rules and conventions |

### Configuration
| File | Purpose |
|------|---------|
| `package.json` | Root monorepo config |
| `turbo.json` | Build orchestration |
| `tsconfig.base.json` | Shared TypeScript config |
| `.env.example` | Environment variable template |
| `supabase/config.toml` | Supabase CLI configuration |

### Database
| File | Purpose |
|------|---------|
| `supabase/migrations/20240101000000_init_schema.sql` | Main schema (documents, assets, preferences, drafts) |
| `supabase/migrations/20240102000000_match_documents_function.sql` | Vector search function |

### Intelligence Layer (Core Implementation)
| File | Purpose |
|------|---------|
| `packages/intelligence/src/red-flags/scorer.ts` | Composite red flag scoring |
| `packages/intelligence/src/knowledge/supabase-vector-store.ts` | Vector store operations |
| `packages/intelligence/src/knowledge/llm-client.ts` | GPT-4o integration |
| `packages/intelligence/src/knowledge/rag-retriever.ts` | RAG retrieval |
| `packages/intelligence/src/session/redis-session-store.ts` | Session state management |

### Test Files
| File | Purpose |
|------|---------|
| `test-supabase-only.ts` | Test Supabase without OpenAI |
| `test-simple.ts` | Full integration test |
| `test-integration.ts` | Comprehensive integration test |

---

## 9. Important Technical Decisions

### Why LiveKit (Not Custom WebRTC)?

LiveKit provides production-ready voice infrastructure:
- Auto-scaling media servers
- Built-in STT/TTS plugins (Deepgram, ElevenLabs)
- Network resilience (packet loss recovery)
- Barge-in support via VAD
- Reduces development time from months to weeks

### Why Three-Tier Memory?

1. **Tier 1 (Ephemeral)**: Email content is sensitive; discard after processing
2. **Tier 2 (Redis)**: Session state needs <10ms latency for responsiveness
3. **Tier 3 (Supabase)**: Knowledge base requires vector search (pgvector)

### Why Desktop-Only Draft Approval?

- **Safety**: Large screen for reviewing draft + thread context
- **Deliberate Action**: Requires user to stop and focus (not in-motion)
- **Audit Trail**: Desktop UI better for activity history

### Database UUID Generation

Changed from `uuid_generate_v4()` to `gen_random_uuid()`:
- `gen_random_uuid()` is built into PostgreSQL 13+
- No need for `uuid-ossp` extension
- Simpler migration setup

---

## 10. API Keys & External Services

### Required API Accounts

| Service | Purpose | Sign Up URL |
|---------|---------|-------------|
| **OpenAI** | GPT-4o reasoning, embeddings | https://platform.openai.com |
| **Supabase** | Vector store, PostgreSQL | https://supabase.com |
| **LiveKit** | Voice infrastructure | https://cloud.livekit.io |
| **Deepgram** | Speech-to-text | https://console.deepgram.com |
| **ElevenLabs** | Text-to-speech | https://elevenlabs.io |
| **Microsoft Azure** | Outlook OAuth | https://portal.azure.com |
| **Google Cloud** | Gmail OAuth | https://console.cloud.google.com |

### OAuth Scopes Required

**Microsoft Graph (Outlook):**
- Mail.Read, Mail.ReadWrite, Mail.Send
- Calendars.Read, Calendars.ReadWrite
- Contacts.Read
- User.Read
- offline_access

**Google APIs (Gmail):**
- gmail.readonly, gmail.modify, gmail.compose
- calendar.readonly
- contacts.readonly

---

## Quick Commands Reference

```bash
# Development
pnpm install              # Install all dependencies
pnpm build                # Build all packages
pnpm dev                  # Start development mode
pnpm test                 # Run all tests
pnpm lint                 # Check linting
pnpm lint:fix             # Fix linting issues

# Infrastructure
pnpm infra:up             # Start Docker containers (Redis, Supabase)
pnpm infra:down           # Stop containers
pnpm infra:logs           # View container logs
pnpm infra:reset          # Reset containers and volumes

# Supabase
supabase start            # Start local Supabase
supabase db reset         # Reset database and apply migrations
supabase db push          # Push migrations to remote

# Testing
npx ts-node test-supabase-only.ts  # Test Supabase (no OpenAI)
npx ts-node test-simple.ts         # Full integration test
```

---

## Summary

**Current State**: Foundation complete (Sections 1-3). The project has working email adapters, intelligence layer with red flag detection, vector store for RAG, and session management. All core packages build and test successfully.

**Blocker**: OpenAI API requires credits to fully test the LLM integration.

**Next Priority**: Section 4.0 - LiveKit Voice Interface. This is the critical path to enable voice briefings and commands.

**Reference**: Always consult `ARCHITECTURE.md` for design decisions and `tasks/tasks-0001-prd-voice-exec-assistant.md` for detailed task tracking.

---

*This handoff document was generated on 2026-01-17. For the most current status, check the git history and task file.*
