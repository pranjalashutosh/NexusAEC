# Task List Management & AI Rules

Guidelines for Cursor AI to manage the `tasks-0001-prd-voice-exec-assistant.md` file.

## 1. Context & Architecture Awareness
**CRITICAL:** Before starting any **Parent Task**, you must:
1. Read the **"Architecture"** note at the top of the Task List.
2. Review the `packages/shared-types` definitions to ensure data consistency.
3. Verify which **Workspace** (e.g., `apps/mobile`, `packages/email-providers`) you should be working in. Do not create files in the root unless explicitly instructed.

## 2. Task Implementation Protocol
- **One sub-task at a time:** Do **NOT** start the next sub-task until you ask the user for permission and they say "yes" or "Go".
- **Step-by-Step Execution:**
  1. **Read:** specific sub-task requirements.
  2. **Check:** existing code in the relevant workspace.
  3. **Implement:** Write the code.
  4. **Verify:**
     - **Monorepo Build:** Run `turbo build --filter=[workspace]` to ensure no type errors.
     - **Unit Tests:** Run `npm test` (or `pnpm test`) **specifically for the package you modified**. Do NOT run the global test suite.
     - *Exception:* If testing WebRTC/Voice requires complex mocking that isn't set up, ask the user: "Tests require manual verification. Proceed to commit?"

## 3. Completion & Commit Protocol
When a **Sub-Task** is complete:
1. **Update Task List:** Mark the sub-task as `[x]` in the markdown file immediately.
2. **Commit Strategy:**
   - You may commit after **each sub-task** to save progress (recommended for complex tasks).
   - **Commit Message Format:**
     ```bash
     git commit -m "feat(scope): brief description" -m "ref: Task