# NexusAEC — Agent Rules

> This file governs how the AI agent should execute implementation plans.
> Read this file FIRST, then read the relevant `implementation_plan` before writing any code.

---

## Implementation Plans

| Plan | File | Status |
|------|------|--------|

| v2 — Seamless Briefing Experience | `implementation_plan_v2.md` | COMPLETE |

**Active plan**: `implementation_plan_v2.md` — Read it in full before starting any step.

---

## Mandatory Pre-Work

1. **Read the active implementation plan** in full before starting any step.
2. **Read the existing file** you are about to modify before making changes. Never modify a file you haven't read.
3. **Understand the existing patterns** by reading the referenced source files in the "Existing Code Reference" table of the implementation plan.

---

## Execution Rules

### Rule 1: Follow the Step Sequence
- Implement steps in the order defined in the active implementation plan.
- Do NOT skip ahead or combine steps unless explicitly told to by the user.
- Each step's `[ ]` checkbox must be marked `[x]` in the plan when completed.

### Rule 2: Mark Progress
- Before starting a step, update its status in the plan from `Not started` to `In progress`.
- After completing a step, update its status to `Done`.
- This prevents duplicate work and wasted tokens.

### Rule 3: No Build/Test/Lint Commands
- **DO NOT run** `pnpm build`, `pnpm test`, `pnpm lint`, or any variant.
- **DO NOT run** `tsc`, `eslint`, `vitest`, or `jest`.
- The user will run these manually and provide results. If you need build/test output, ask the user.
- You MAY run `pnpm install` or `pnpm add <package>` if a new dependency is required.

### Rule 4: Match Existing Code Patterns
- Follow the EXACT patterns used in existing tool files (`email-tools.ts`, `navigation-tools.ts`).
- Use the same `ToolDefinition` interface, `ToolResult` return type, and export structure.
- Use the same logger pattern: `import { createLogger } from '@nexus-aec/logger';`
- Use `.js` extensions in import paths (the project uses ESM with TypeScript).

### Rule 5: Minimize Token Usage
- Do NOT read files you have already read in this session.
- Do NOT re-explore directories you have already explored.
- When modifying a file, make targeted edits — do not rewrite entire files.
- If a file hasn't changed since you last read it, work from your memory of its contents.

### Rule 6: One Step at a Time
- Complete one step fully before moving to the next.
- After completing a step, briefly summarize what was done and what's next.
- If a step has sub-tasks, complete all sub-tasks before marking the step done.

### Rule 7: No Over-Engineering
- Do NOT add features not specified in the implementation plan.
- Do NOT add extra error handling beyond what's necessary.
- Do NOT create utility files, helper modules, or abstractions unless specified.
- Do NOT add comments to code you didn't write.
- Do NOT refactor surrounding code.

### Rule 8: PRD Rule 60 Compliance
- It may store rules, preferences, feedback, and contextual observations ABOUT the user's work.
- The BriefedEmailStore may store email IDs and metadata (briefed/actioned status, timestamps) but NOT email content.


### Rule 9: Dependency Management
- Before adding a new npm dependency, check if it already exists in the package's `package.json`.
- `ioredis` is already in `packages/livekit-agent/package.json`.
- `@supabase/supabase-js` is already in `packages/livekit-agent/package.json`.
- Use `pnpm --filter @nexus-aec/livekit-agent add <package>` to add dependencies.

### Rule 10: Ask Before Destructive Changes
- Do NOT delete existing files.
- Do NOT remove existing exports or functions.
- Do NOT change function signatures of existing functions (add optional parameters instead).
- If you need to restructure something, ask the user first.

---

## Quick Reference

| What | Where |
|------|-------|
| Implementation plan v2 (Briefing — ACTIVE) | `/Users/ashutoshpranjal/nexusAEC/implementation_plan_v2.md` |
| Tool pattern reference | `packages/livekit-agent/src/tools/email-tools.ts` |
| Navigation tools | `packages/livekit-agent/src/tools/navigation-tools.ts` |
| System prompt reference | `packages/livekit-agent/src/prompts/system-prompt.ts` |
| Agent entry point | `packages/livekit-agent/src/agent.ts` |
| Reasoning loop | `packages/livekit-agent/src/reasoning/reasoning-loop.ts` |
| Reasoning LLM adapter | `packages/livekit-agent/src/llm/reasoning-llm.ts` |
| Briefing pipeline | `packages/livekit-agent/src/briefing-pipeline.ts` |
| Email bootstrap | `packages/livekit-agent/src/email-bootstrap.ts` |
| Gmail adapter | `packages/email-providers/src/adapters/gmail-adapter.ts` |
| Unified inbox | `packages/email-providers/src/services/unified-inbox.ts` |
| Knowledge store | `packages/livekit-agent/src/knowledge/user-knowledge-store.ts` |
| Tools index | `packages/livekit-agent/src/tools/index.ts` |

---

## Completion Tracking


### v2 — Seamless Briefing Experience (COMPLETE)

- [x] Step 1: BriefingSessionTracker
- [x] Step 2: Wire Tracker into ReasoningLoop
- [x] Step 3: Email Actions in Tracker
- [x] Step 4: BriefedEmailStore (Redis)
- [x] Step 5: Filter Briefed Emails from Pipeline
- [x] Step 6: Fix Topic Coverage
- [x] Step 7: System Prompt & Greeting Updates
- [x] Step 8: Real-Time Inbox Awareness
- [x] Step 9: Internal-Only Briefing Tracking
