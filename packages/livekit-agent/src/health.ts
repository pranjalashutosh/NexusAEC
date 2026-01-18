/**
 * @nexus-aec/livekit-agent - Health Check Server
 *
 * Simple HTTP health check endpoint for container orchestration.
 * Responds to GET /health with agent status.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '@nexus-aec/logger';
import { getActiveSessionCount, getAllSessions } from './agent.js';
import { isEnvironmentConfigured, validateEnvironment } from './config.js';

const logger = createLogger({ baseContext: { component: 'health-server' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Health status response
 */
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: {
    configured: boolean;
    missing?: string[];
  };
  agent: {
    activeSessions: number;
    sessionDetails?: Array<{
      sessionId: string;
      roomName: string;
      durationMs: number;
    }>;
  };
}

// =============================================================================
// Health Server
// =============================================================================

const startTime = Date.now();
let server: ReturnType<typeof createServer> | null = null;

/**
 * Get current health status
 */
function getHealthStatus(): HealthStatus {
  const missingVars = validateEnvironment();
  const sessions = getAllSessions();

  const status: HealthStatus = {
    status: missingVars.length === 0 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env['npm_package_version'] ?? '0.1.0',
    environment: {
      configured: isEnvironmentConfigured(),
    },
    agent: {
      activeSessions: getActiveSessionCount(),
    },
  };

  // Add missing vars if any
  if (missingVars.length > 0) {
    status.environment.missing = missingVars;
  }

  // Add session details if there are active sessions
  if (sessions.length > 0) {
    status.agent.sessionDetails = sessions.map((s) => ({
      sessionId: s.sessionId,
      roomName: s.roomName,
      durationMs: Date.now() - s.startedAt.getTime(),
    }));
  }

  return status;
}

/**
 * Handle HTTP request
 */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';

  if (req.method === 'GET' && (url === '/health' || url === '/healthz' || url === '/')) {
    const health = getHealthStatus();
    const statusCode = health.status === 'healthy' ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
    return;
  }

  if (req.method === 'GET' && url === '/ready') {
    // Readiness check - are we ready to receive traffic?
    const isReady = isEnvironmentConfigured();
    const statusCode = isReady ? 200 : 503;

    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ready: isReady }));
    return;
  }

  if (req.method === 'GET' && url === '/live') {
    // Liveness check - is the process alive?
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ alive: true }));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

/**
 * Start the health check server
 */
export function startHealthServer(port: number = 8080): void {
  if (server) {
    logger.warn('Health server already running');
    return;
  }

  server = createServer(handleRequest);

  server.listen(port, () => {
    logger.info('Health server started', { port });
  });

  server.on('error', (error) => {
    logger.error('Health server error', error);
  });
}

/**
 * Stop the health check server
 */
export function stopHealthServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }

    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        server = null;
        logger.info('Health server stopped');
        resolve();
      }
    });
  });
}

/**
 * Check if health server is running
 */
export function isHealthServerRunning(): boolean {
  return server !== null;
}
