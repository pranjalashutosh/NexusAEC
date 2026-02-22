Based on your analysis of the codebase and the tasks in
tasks/tasks-0001-prd-voice-exec-assistant.md, create a comprehensive
.claude/RULES.md file that includes:

1. Project context (name, architecture type, package manager, build system)
2. Critical pre-flight checks before starting any task (read task list, check
   architecture, verify workspace, confirm dependencies)
3. Task execution protocol with 4 steps: Understanding, Implementation,
   Verification (with exact commands for turbo build, pnpm test, lint), and
   Commit
4. Stop conditions (when to stop and ask for help)
5. User control rules (never auto-proceed, always wait for approval)
6. Code quality standards (TypeScript strict mode, no any types, testing >80%
   coverage, error handling with Result types)
7. Monorepo awareness rules (workspace aliases, build order, package
   independence)
8. LiveKit-specific rules (agent in apps/agent, never custom WebRTC, test
   manually)
9. Communication style (before starting, during work, after completion)
10. Progress tracking (how to update the tasks file with [x], [🔄], [🚫])
11. Definition of done from the task list

Make it specific to this NexusAEC project using the actual workspace names and
conventions you found in the codebase.
