/**
 * Entry point for running the NexusAEC Voice Agent.
 *
 * Usage:
 *   pnpm --filter @nexus-aec/livekit-agent start:dev
 */
import { startAgent } from './agent.js';

startAgent().catch((err: unknown) => {
  console.error('Agent failed to start:', err);
  process.exit(1);
});
