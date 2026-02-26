import { getRedisClient, isRedisAvailable } from '../lib/redis';

import type { FastifyInstance } from 'fastify';

interface DependencyStatus {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  ok: boolean;
  timestamp: string;
  uptime: number;
  dependencies: {
    redis: DependencyStatus;
  };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  // Full health check with dependency status
  app.get('/health', async () => {
    const redisStatus = await checkRedis();

    const ok = redisStatus.status !== 'down';

    const response: HealthResponse = {
      ok,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        redis: redisStatus,
      },
    };

    return response;
  });

  // Kubernetes liveness probe — is the process alive?
  app.get('/live', () => {
    return { ok: true };
  });

  // Kubernetes readiness probe — can it serve traffic?
  app.get('/ready', async (_request, reply) => {
    const redisStatus = await checkRedis();

    if (redisStatus.status === 'down') {
      return reply.status(503).send({
        ok: false,
        reason: 'Redis unavailable',
      });
    }

    return { ok: true };
  });
}

async function checkRedis(): Promise<DependencyStatus> {
  if (!isRedisAvailable()) {
    return { status: 'down', error: 'Not connected' };
  }

  const client = getRedisClient();
  if (!client) {
    return { status: 'down', error: 'Client not initialized' };
  }

  try {
    const start = Date.now();
    await client.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
