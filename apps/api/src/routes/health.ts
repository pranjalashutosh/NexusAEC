import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', () => {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
    };
  });
}
