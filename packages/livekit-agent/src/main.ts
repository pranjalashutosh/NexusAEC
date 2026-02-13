/**
 * Entry point for running the NexusAEC Voice Agent.
 *
 * Usage:
 *   pnpm --filter @nexus-aec/livekit-agent start:dev
 */
import { startAgent } from './agent.js';

// Catch unhandled rejections — the LiveKit SDK pipeline uses many
// fire-and-forget Promises internally. An unhandled rejection here
// would silently kill a pipeline stage (e.g., LLM → TTS) and cause
// the "job is unresponsive" warning without any error output.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

startAgent().catch((err: unknown) => {
  console.error('Agent failed to start:', err);
  process.exit(1);
});
