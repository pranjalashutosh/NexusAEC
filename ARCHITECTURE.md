# NexusAEC - Architecture Overview

**Version:** 2.0 | **Architecture:** Unified LiveKit Voice Stack

## Purpose

NexusAEC is a **voice-driven AI executive assistant** that enables professionals
to manage email through natural voice interactions. It aggregates emails from
Outlook + Gmail, identifies urgent messages via AI-powered red flag detection,
generates podcast-style voice briefings, and executes email actions via voice
commands.

## Core Principles

1. **Voice-First** — All interactions designed for hands-free operation
2. **Safety-First** — High-risk actions (send email) require desktop approval
3. **Privacy-First** — Email content never persisted (ephemeral only, PRD Rule 60)
4. **Provider-Agnostic** — Unified interface across Outlook and Gmail
5. **Three-Tier Memory** — Ephemeral → Redis → Supabase for performance + privacy

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      External Services                       │
│  Microsoft Graph │ Google APIs │ LiveKit Cloud │ OpenAI      │
└───────┬──────────┴──────┬──────┴───────┬──────┴──────┬──────┘
        │                 │              │             │
┌───────▼─────────────────▼──────────────▼─────────────▼──────┐
│                      NexusAEC System                         │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Mobile  │  │ Desktop  │  │ Backend  │  │  LiveKit │    │
│  │(RN + LK) │  │(Electron)│  │  API     │  │  Agent   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴─────────────┴─────────────┘          │
│                          │                                   │
│  ┌───────────────────────▼──────────────────────────┐       │
│  │           Shared Packages (Monorepo)             │       │
│  │  shared-types │ email-providers │ intelligence   │       │
│  │  encryption   │ secure-storage  │ livekit-agent  │       │
│  │  logger       │                 │                │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │         Infrastructure Services                   │       │
│  │  Redis (session state) │ Supabase (vector store) │       │
│  └──────────────────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

## Package Dependency Order (Turborepo)

```
1. shared-types      (no dependencies)
2. encryption        (→ shared-types)
3. logger            (→ shared-types)
4. secure-storage    (→ shared-types, encryption)
5. email-providers   (→ shared-types, encryption, logger, secure-storage)
6. intelligence      (→ shared-types, logger, email-providers)
7. livekit-agent     (→ shared-types, logger, intelligence)
8. api               (→ shared-types, logger, email-providers, intelligence)
9. mobile            (→ shared-types, email-providers, intelligence)
10. desktop          (→ shared-types, email-providers, intelligence)
```

## Detailed Architecture Docs

Each document is self-contained and focused on one architectural domain:

| Document | Scope | When to read |
|----------|-------|-------------|
| [Memory Model](docs/architecture/memory-model.md) | 3-tier memory (ephemeral → Redis → Supabase), data flow between tiers, tier selection guide | Working on data persistence, caching, session state, or vector search |
| [Voice Stack](docs/architecture/voice-stack.md) | LiveKit rooms, STT/TTS pipeline, barge-in handling, dead zone recovery | Working on voice features, audio processing, or network resilience |
| [Email Integration](docs/architecture/email-integration.md) | Unified adapter pattern, data normalization, inbox merging, smart draft routing | Working on email providers, OAuth, or draft workflows |
| [Intelligence Layer](docs/architecture/intelligence-layer.md) | Red flag detection, topic clustering, briefing generation | Working on email analysis, scoring, or briefing scripts |
| [Application Layer](docs/architecture/application-layer.md) | Mobile (RN), Desktop (Electron), Backend API route/middleware architecture | Working on any app-level feature or API endpoint |
| [Data Flows](docs/architecture/data-flows.md) | End-to-end voice command execution, morning briefing journey | Understanding how components interact across a full user flow |
| [Security](docs/architecture/security.md) | Transport, auth, encryption, privacy, access control, threat model | Working on auth, tokens, encryption, or privacy features |
| [Deployment](docs/architecture/deployment.md) | Local dev setup, production infra, scaling strategy | Working on Docker, CI/CD, or production deployment |
| [Design Decisions](docs/architecture/design-decisions.md) | ADRs: why LiveKit, why adapters, why 3-tier, why desktop-only drafts, why monorepo | Understanding rationale behind architectural choices |
| [Reasoning Architecture](docs/architecture/reasoning-architecture-analysis.md) | Analysis of dual reasoning systems (pre-computed vs real-time) | Working on the briefing pipeline or LLM reasoning loop |
