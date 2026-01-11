# NexusAEC - AI Assistant Rules

**Last Updated:** 2026-01-09
**Project:** Voice-Driven AI Executive Assistant (Unified LiveKit Architecture)

---

## 1. Project Context

### Core Identity
- **Project Name:** NexusAEC
- **Architecture:** Monorepo with Turborepo + pnpm workspaces
- **Package Manager:** pnpm 9.0.0 (REQUIRED - do not use npm or yarn)
- **Build System:** Turborepo 2.0
- **Language:** TypeScript 5.4+ with strict mode
- **Testing:** Jest 29.7
- **Node Version:** >=20.0.0

### Workspace Structure
```
nexusAEC/
├── packages/               # Shared libraries
│   ├── @nexus-aec/shared-types
│   ├── @nexus-aec/encryption
│   ├── @nexus-aec/logger
│   ├── @nexus-aec/secure-storage
│   ├── @nexus-aec/email-providers
│   └── @nexus-aec/intelligence (future)
├── apps/                   # Applications
│   ├── mobile/            (React Native - future)
│   ├── desktop/           (Electron - future)
│   ├── api/               (Express/Fastify - future)
│   └── agent/             (LiveKit Agent - future)
├── infra/                 # Infrastructure (Docker Compose, K8s)
├── tasks/                 # Task lists & project management
└── .claude/               # AI assistant guidance
```

### Key Architecture Decisions
- **Voice Stack:** LiveKit Cloud (NOT custom WebRTC)
- **Email Integration:** Unified adapter pattern (Outlook + Gmail)
- **Memory Tiers:** Ephemeral (in-memory) → Redis (session) → Supabase (knowledge)
- **STT:** Deepgram Nova-2 via LiveKit plugin
- **TTS:** ElevenLabs Turbo v2.5 via LiveKit plugin
- **AI:** GPT-4o for reasoning & function calling

---

## 2. Critical Pre-Flight Checks

**BEFORE starting ANY task, you MUST:**

### ✅ Step 1: Read the Task List
```bash
# Always read the current task list first
cat tasks/tasks-0001-prd-voice-exec-assistant.md
```
- Verify the task number you're working on
- Check dependencies (tasks with `^` prefix in dependsOn)
- Confirm the task is not already marked `[x]` (completed)

### ✅ Step 2: Check Architecture Alignment
- Does this task fit the LiveKit architecture? (No custom WebRTC!)
- Does this task use the unified adapter pattern? (No direct Outlook/Gmail calls!)
- Does this task respect the three-tier memory model?

### ✅ Step 3: Verify Workspace Structure
```bash
# Check if the target package/app exists
ls -la packages/
ls -la apps/
```
- If the workspace doesn't exist, create it with proper structure
- Always use workspace protocol: `workspace:*` for internal dependencies

### ✅ Step 4: Confirm Dependencies
```bash
# Check what's already built
pnpm turbo run build --dry-run
```
- Verify all upstream dependencies are complete
- Check if shared types are up to date

### ✅ Step 5: Read Existing Code
```bash
# NEVER propose changes without reading existing code first
cat packages/<package-name>/src/index.ts
```
- Understand existing patterns and conventions
- Match the style of existing code
- Don't duplicate functionality

---

## 3. Task Execution Protocol

### Phase 1: Understanding (ASK FIRST)

**STOP and communicate your plan:**

```markdown
## Task Analysis: [Task Number] - [Task Name]

**What I understand:**
- [What the task is asking for]
- [Which files will be affected]
- [What dependencies are needed]

**My implementation approach:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Questions/Clarifications:**
- [Any ambiguities or decisions needed]

**Estimated scope:**
- Files to create: [X]
- Files to modify: [Y]
- Tests to write: [Z]

**Ready to proceed?**
```

**WAIT FOR USER APPROVAL BEFORE PROCEEDING.**

### Phase 2: Implementation

#### 2.1 Create/Modify Code
- Follow TypeScript strict mode (no `any` types)
- Use workspace imports: `import { X } from '@nexus-aec/shared-types'`
- Add JSDoc comments for public APIs
- Handle errors with Result types or try/catch with proper error messages
- No console.log - use `@nexus-aec/logger`

#### 2.2 Write Tests
- Co-locate tests: `src/foo.ts` → `src/foo.test.ts`
- Use descriptive test names: `it('should parse CSV with valid asset data')`
- Test happy path + error cases
- Target >80% coverage for critical paths
- Mock external services (APIs, databases)

#### 2.3 Update Dependencies
```bash
# Add dependencies to the correct workspace
cd packages/<package-name>
pnpm add <dependency>

# Add workspace dependencies
pnpm add @nexus-aec/<other-package>@workspace:*
```

### Phase 3: Verification

**Run these commands IN ORDER:**

```bash
# 1. Type check (MUST pass)
pnpm type-check

# 2. Lint (MUST pass)
pnpm lint

# 3. Format check (MUST pass)
pnpm format:check

# 4. Build (MUST pass)
pnpm build

# 5. Run tests (MUST pass with >80% coverage)
pnpm test

# 6. Run specific package tests
cd packages/<package-name>
pnpm test
```

**If ANY command fails:**
- Fix the issue immediately
- Re-run all verification commands
- Do NOT proceed until all checks pass

### Phase 4: Documentation & Commit

#### 4.1 Update Task List
Edit `tasks/tasks-0001-prd-voice-exec-assistant.md`:
```markdown
- [x] 3.15 Implement foo.ts: bar functionality
```

Change `[ ]` to `[x]` for the completed task.

**Status Markers:**
- `[ ]` - Not started
- `[🔄]` - In progress (use this while working)
- `[x]` - Completed
- `[🚫]` - Blocked or skipped (with explanation)

#### 4.2 Commit Message Format
```bash
git add .
git commit -m "feat(package-name): implement task 3.15 - short description

- Detailed change 1
- Detailed change 2
- Add tests with >80% coverage

Closes #3.15

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

**Commit Prefixes:**
- `feat(scope):` - New feature
- `fix(scope):` - Bug fix
- `refactor(scope):` - Code refactoring
- `test(scope):` - Add/update tests
- `docs(scope):` - Documentation only
- `chore(scope):` - Build, CI, dependencies

**Scopes:** Use workspace name without `@nexus-aec/` prefix
- `shared-types`, `encryption`, `logger`, `email-providers`, `intelligence`
- `mobile`, `desktop`, `api`, `agent`
- `infra`, `root`

#### 4.3 Summary Report
```markdown
## Task 3.15 - Complete ✅

**Files Created:**
- `packages/foo/src/bar.ts` (120 lines)
- `packages/foo/src/bar.test.ts` (80 lines)

**Files Modified:**
- `packages/foo/src/index.ts` (+5 lines)

**Test Coverage:**
- bar.ts: 95% (19/20 lines)

**Verification:**
- ✅ Type check passed
- ✅ Lint passed
- ✅ Build passed
- ✅ Tests passed (23 tests, 0 failures)

**Next Task:** 3.16 - Implement baz functionality
```

---

## 4. Stop Conditions (When to Ask for Help)

**STOP and ask the user if:**

1. **Task Ambiguity**
   - The task description is unclear or contradictory
   - Multiple valid implementation approaches exist
   - Requirements conflict with existing architecture

2. **Missing Dependencies**
   - Required external service credentials not in `.env.example`
   - Upstream task is not completed
   - Breaking changes needed in shared types

3. **Architectural Concerns**
   - Task requires deviation from LiveKit architecture
   - Task introduces new external service not in plan
   - Task impacts security or privacy model

4. **Scope Creep Detection**
   - Task is significantly larger than expected (>500 lines)
   - Task reveals need for additional tasks not in list
   - Task uncovers blocking issues

5. **Test Failures**
   - Tests fail after 3 fix attempts
   - Flaky tests that pass/fail inconsistently
   - Coverage cannot reach >80% due to architecture

6. **Build/Type Errors**
   - TypeScript errors in shared-types affect multiple packages
   - Circular dependency detected
   - Build takes >5 minutes (performance issue)

---

## 5. User Control Rules

### 🚫 NEVER Auto-Proceed
- Do NOT move to next task without explicit approval
- Do NOT make architectural decisions without discussion
- Do NOT commit code without user confirmation
- Do NOT install new major dependencies without approval

### ✅ ALWAYS Wait for User Input
- After presenting implementation plan (Phase 1)
- After completing verification (Phase 3)
- When encountering stop conditions (Section 4)
- When discovering scope changes

### 🤝 User Approval Required For
- Starting a new task
- Adding new npm packages (except dev dependencies)
- Changing shared types that affect multiple packages
- Modifying CI/CD pipeline
- Changing infrastructure configuration
- Creating new workspaces (packages/* or apps/*)

---

## 6. Code Quality Standards

### TypeScript Rules
```typescript
// ✅ DO: Use strict types
interface EmailAddress {
  email: string;
  name?: string;
}

function parseEmail(raw: string): Result<EmailAddress, ParseError> {
  // ...
}

// 🚫 DON'T: Use any or implicit any
function parseEmail(raw: any): any {  // ❌
  // ...
}

// ✅ DO: Use discriminated unions
type EmailSource = 'OUTLOOK' | 'GMAIL';

interface StandardEmail {
  source: EmailSource;  // Discriminator
  // ...
}

// 🚫 DON'T: Use string literals without type safety
interface StandardEmail {
  source: string;  // ❌ Too loose
}
```

### Error Handling
```typescript
// ✅ DO: Use Result types or proper error handling
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

async function fetchEmails(): Promise<Result<Email[]>> {
  try {
    const emails = await api.fetch();
    return { success: true, data: emails };
  } catch (error) {
    logger.error('Failed to fetch emails', { error });
    return { success: false, error: error as Error };
  }
}

// 🚫 DON'T: Swallow errors or throw without context
async function fetchEmails() {
  try {
    return await api.fetch();
  } catch (e) {
    return [];  // ❌ Lost error information
  }
}
```

### Testing Standards
```typescript
// ✅ DO: Descriptive test names and comprehensive coverage
describe('OutlookAdapter', () => {
  describe('fetchThreads', () => {
    it('should return normalized threads from Microsoft Graph API', async () => {
      // Arrange
      const mockResponse = createMockGraphResponse();
      mockGraphClient.get.mockResolvedValue(mockResponse);

      // Act
      const result = await adapter.fetchThreads({ folderId: 'inbox' });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.data[0].source).toBe('OUTLOOK');
    });

    it('should handle API errors gracefully', async () => {
      // Test error case
    });

    it('should handle pagination correctly', async () => {
      // Test pagination
    });
  });
});

// 🚫 DON'T: Vague test names or missing coverage
it('works', () => {  // ❌
  expect(adapter.fetchThreads()).toBeTruthy();
});
```

### Logging (No PII!)
```typescript
import { logger } from '@nexus-aec/logger';

// ✅ DO: Structured logging with sanitized data
logger.info('Email sync completed', {
  source: 'OUTLOOK',
  count: emails.length,
  duration: Date.now() - startTime,
  userId: hashUserId(userId),  // Hashed, not raw
});

// 🚫 DON'T: Log PII (emails, names, content)
logger.info('Synced emails', {
  emails: emails.map(e => e.from.email)  // ❌ PII leak
});
```

---

## 7. Monorepo Awareness Rules

### Workspace Dependencies
```json
// ✅ DO: Use workspace protocol in package.json
{
  "dependencies": {
    "@nexus-aec/shared-types": "workspace:*",
    "@nexus-aec/logger": "workspace:*"
  }
}

// 🚫 DON'T: Use version numbers for workspace deps
{
  "dependencies": {
    "@nexus-aec/shared-types": "0.1.0"  // ❌
  }
}
```

### Build Order (Turborepo Handles This)
```bash
# ✅ DO: Let Turborepo manage build order
pnpm turbo run build

# 🚫 DON'T: Manually build in specific order
cd packages/shared-types && pnpm build  # ❌ Turborepo does this
cd packages/email-providers && pnpm build
```

### Package Independence
- Each package MUST be independently testable
- Each package MUST have its own `package.json`
- Each package MUST declare its own dependencies
- Shared logic MUST go in `packages/`, not duplicated

### Circular Dependencies
```typescript
// 🚫 DON'T: Create circular dependencies
// shared-types imports from email-providers ❌
// email-providers imports from shared-types ❌

// ✅ DO: Use dependency hierarchy
// shared-types: No internal dependencies (root)
// encryption: Depends only on shared-types
// email-providers: Depends on shared-types + encryption + logger
```

---

## 8. LiveKit-Specific Rules

### 🚫 NEVER: Custom WebRTC Implementation
```typescript
// 🚫 DON'T: Implement custom WebRTC, audio handling, or signaling
class CustomVoiceHandler {  // ❌ WRONG
  startRecording() { /* navigator.mediaDevices */ }
}

// ✅ DO: Use LiveKit SDK
import { Room } from '@livekit/rtc-node';

async function connectToRoom(token: string) {
  const room = new Room();
  await room.connect(livekitUrl, token);
  return room;
}
```

### Agent Location
- LiveKit Agent MUST be in `apps/agent/` (NOT `packages/`)
- Agent is an application, not a shared library

### STT/TTS Configuration
```typescript
// ✅ DO: Configure via LiveKit plugins
const sttConfig = {
  provider: 'deepgram',
  model: 'nova-2',
  language: 'en-US',
  // Custom vocabulary for domain terms
  vocabulary: ['NCE', 'P-104', 'Valve Assembly', ...]
};

const ttsConfig = {
  provider: 'elevenlabs',
  model: 'eleven_turbo_v2',
  voiceId: process.env.ELEVENLABS_VOICE_ID
};

// 🚫 DON'T: Implement custom STT/TTS
```

### Testing LiveKit Components
- Unit tests: Mock LiveKit SDK
- Integration tests: Use LiveKit Cloud test environment
- Manual testing REQUIRED for voice interactions (no automated voice E2E)

---

## 9. Communication Style

### Before Starting (Phase 1)
```markdown
I've read task 3.15 from the task list. Here's my understanding:

**Task:** Implement CSV parser for asset ingestion

**Approach:**
1. Create `packages/intelligence/src/knowledge/sources/csv-parser.ts`
2. Use `csv-parse` library for parsing
3. Validate required fields: AssetID, Name, Description, Category, Location
4. Return typed `Asset[]` or error
5. Add comprehensive tests

**Questions:**
- Should we support custom column names via mapping?
- What's the max file size we should support?

**Files to create:**
- `csv-parser.ts` (~150 lines)
- `csv-parser.test.ts` (~200 lines)

Ready to proceed?
```

### During Work (Phase 2)
```markdown
✅ Created csv-parser.ts with validation
🔄 Writing tests (15/20 test cases complete)
⏭️  Next: Add error handling for malformed CSV
```

Keep updates concise unless user asks for details.

### After Completion (Phase 3)
```markdown
## Task 3.15 Complete ✅

**Summary:**
- Implemented CSV parser with validation
- Added 20 test cases (coverage: 94%)
- All verification checks passed

**Files:**
- Created: `csv-parser.ts` (145 lines), `csv-parser.test.ts` (203 lines)
- Modified: `index.ts` (+3 lines)

**Ready for:** Task 3.16 - PDF extractor

[Detailed verification output available if needed]
```

### When Blocked (Stop Conditions)
```markdown
## ⚠️ Need Guidance - Task 3.15

**Issue:** CSV parser needs to handle 3 different asset management system formats

**Options:**
1. Support all 3 formats with auto-detection (~400 lines, complex)
2. Support generic format with column mapping config (~200 lines, flexible)
3. Support only NCE format for MVP (~100 lines, simple)

**Recommendation:** Option 2 - balances flexibility and complexity

**Waiting for:** Your decision on which option to implement
```

---

## 10. Progress Tracking

### Task Status Markers

Update `tasks/tasks-0001-prd-voice-exec-assistant.md` with these markers:

```markdown
- [ ] 3.15 Not started - waiting
- [🔄] 3.16 In progress - implementing CSV parser
- [x] 3.17 Complete - CSV parser with tests
- [🚫] 3.18 Blocked - waiting for API credentials
```

### Conventions
- **One task at a time**: Only ONE `[🔄]` marker should exist
- **Update immediately**: Change status as soon as you start/complete
- **Explain blocks**: Add reason after `[🚫]` marker
- **Link commits**: Reference task number in commit messages

### Task Dependencies
```markdown
- [x] 3.12 Provision Supabase project
  - [x] 3.13 Design vector store schema (depends on 3.12)
    - [ ] 3.14 Implement SupabaseVectorStore (depends on 3.13)
```

Only start 3.14 after 3.13 is marked `[x]`.

---

## 11. Definition of Done

A task is complete when ALL criteria are met:

### ✅ Code Quality
- [ ] Code follows TypeScript strict mode (no `any` types)
- [ ] All functions have proper error handling
- [ ] No console.log (use `@nexus-aec/logger`)
- [ ] JSDoc comments on public APIs
- [ ] Code follows existing patterns in the package

### ✅ Testing
- [ ] Unit tests written (co-located `.test.ts` files)
- [ ] Test coverage >80% for critical paths
- [ ] All tests pass: `pnpm test`
- [ ] Tests cover both happy path and error cases
- [ ] External services are mocked

### ✅ Verification
- [ ] TypeScript type check passes: `pnpm type-check`
- [ ] ESLint passes: `pnpm lint`
- [ ] Prettier check passes: `pnpm format:check`
- [ ] Build succeeds: `pnpm build`
- [ ] No new console warnings or errors

### ✅ Documentation
- [ ] Task marked `[x]` in task list
- [ ] README updated if adding new CLI command or public API
- [ ] `.env.example` updated if adding new environment variables
- [ ] Architecture docs updated if changing system design

### ✅ Integration
- [ ] Changes work with existing packages (no breaking changes)
- [ ] Workspace dependencies properly declared
- [ ] No circular dependencies introduced
- [ ] Changes tested in local Docker environment (if using infra)

### ✅ Commit
- [ ] Commit message follows format (feat/fix/refactor + scope)
- [ ] Commit references task number
- [ ] Co-authored-by: Claude line present

### ✅ LiveKit-Specific (if applicable)
- [ ] Uses LiveKit SDK (no custom WebRTC)
- [ ] Tested with actual LiveKit Cloud connection (manual test)
- [ ] Configuration uses LiveKit plugins (STT/TTS)

---

## 12. Quick Reference Commands

```bash
# Development
pnpm dev                  # Run all packages in watch mode
pnpm build                # Build all packages (Turborepo)
pnpm test                 # Run all tests
pnpm test:watch           # Watch mode for tests

# Quality Checks (run before commit)
pnpm type-check           # TypeScript validation
pnpm lint                 # ESLint
pnpm lint:fix             # ESLint with auto-fix
pnpm format:check         # Prettier validation
pnpm format               # Prettier auto-format

# Infrastructure
pnpm infra:up             # Start Redis + PostgreSQL
pnpm infra:up:tools       # Start with Redis Commander + pgAdmin
pnpm infra:down           # Stop all services
pnpm infra:reset          # Reset all data (⚠️ destructive)
pnpm infra:logs           # View logs

# Package-Specific
cd packages/<name>
pnpm add <dependency>     # Add dependency
pnpm test                 # Run package tests
pnpm build                # Build single package

# Workspace
pnpm add <dep> -w         # Add to root workspace
pnpm add @nexus-aec/<pkg>@workspace:*  # Add workspace dep
```

---

## 13. Emergency Procedures

### Build Failures
```bash
# Clean and rebuild
pnpm clean
rm -rf node_modules
pnpm install
pnpm build
```

### Type Errors Cascade
```bash
# Rebuild shared-types first
cd packages/shared-types
pnpm build
cd ../..
pnpm type-check
```

### Test Database Issues
```bash
# Reset local infrastructure
pnpm infra:reset
pnpm infra:up
# Re-run tests
pnpm test
```

### Workspace Dependency Issues
```bash
# Verify workspace links
pnpm list -r --depth 0
# Reinstall if needed
rm -rf node_modules packages/*/node_modules
pnpm install
```

---

## 14. Final Checklist (Before Marking Task Complete)

```markdown
## Task 3.X - Final Verification

### Pre-Submit Checklist
- [ ] Read existing code before proposing changes
- [ ] Task status updated to [🔄] when started
- [ ] Implementation follows existing patterns
- [ ] No `any` types or console.log
- [ ] Tests written with >80% coverage
- [ ] All verification commands passed:
  - [ ] `pnpm type-check` ✅
  - [ ] `pnpm lint` ✅
  - [ ] `pnpm format:check` ✅
  - [ ] `pnpm build` ✅
  - [ ] `pnpm test` ✅
- [ ] Task marked [x] in task list
- [ ] Commit message follows format
- [ ] Summary report provided to user
- [ ] User approved next steps

### Ready to Proceed?
**Waiting for user approval to move to next task.**
```

---

**Remember:** When in doubt, STOP and ASK. User control is paramount. Quality over speed. The goal is reliable, maintainable code that follows the architecture, not quick hacks.

