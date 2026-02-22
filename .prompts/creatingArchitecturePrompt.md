Create .claude/ARCHITECTURE.md that documents the complete system architecture
based on what you found in the codebase and tasks list:

1. System overview (Voice-driven AI executive assistant with LiveKit)
2. Complete technology stack (LiveKit, React Native, Electron, Python agent,
   Supabase, Redis, etc.)
3. Actual monorepo structure showing all existing apps/ and packages/
   directories
4. Three-tier memory architecture (Tier 1: Ephemeral in-memory, Tier 2: Redis
   session state, Tier 3: Supabase vector store)
5. Data flow diagrams in text format for: email fetching, voice interaction,
   draft creation
6. Key integration points between components
7. Security measures (OAuth, encryption, PII scrubbing)
8. Critical patterns: unified email adapter interface, smart draft routing,
   Drive State pattern
9. Development workflow commands (turbo build, turbo test, etc.)
10. Package dependency graph showing the directional dependencies
11. Open technical decisions that need to be made

Use the actual workspace names and structure from the codebase. Reference
specific files like packages/shared-types/src/index.ts where types are defined.
