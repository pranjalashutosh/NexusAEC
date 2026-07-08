# =============================================================================
# NexusAEC Worker - Production Dockerfile
# =============================================================================
#
# Multi-stage build for the background worker (job-bus consumer → LangGraph
# graphs). Runs as the SECOND container on the agent EC2 host (task 2.11).
#
# Build:
#   docker build -t nexus-aec-worker:latest -f apps/worker/Dockerfile .
#
# Run:
#   docker run --env-file .env nexus-aec-worker:latest
#
# Workspace dep graph (build order matters):
#   shared-types, logger, encryption  →  no internal deps
#   secure-storage                    →  encryption, shared-types
#   intelligence                      →  logger, shared-types
#   email-providers                   →  encryption, logger, secure-storage, shared-types
#   agent-graph                       →  email-providers, intelligence, logger, shared-types
#   worker                            →  agent-graph, email-providers, encryption, intelligence, logger, shared-types
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/encryption/package.json ./packages/encryption/
COPY packages/secure-storage/package.json ./packages/secure-storage/
COPY packages/intelligence/package.json ./packages/intelligence/
COPY packages/email-providers/package.json ./packages/email-providers/
COPY packages/agent-graph/package.json ./packages/agent-graph/
COPY apps/worker/package.json ./apps/worker/

RUN npm install -g pnpm@9
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/packages/encryption/node_modules ./packages/encryption/node_modules
COPY --from=deps /app/packages/secure-storage/node_modules ./packages/secure-storage/node_modules
COPY --from=deps /app/packages/intelligence/node_modules ./packages/intelligence/node_modules
COPY --from=deps /app/packages/email-providers/node_modules ./packages/email-providers/node_modules
COPY --from=deps /app/packages/agent-graph/node_modules ./packages/agent-graph/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules

COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/logger ./packages/logger
COPY packages/encryption ./packages/encryption
COPY packages/secure-storage ./packages/secure-storage
COPY packages/intelligence ./packages/intelligence
COPY packages/email-providers ./packages/email-providers
COPY packages/agent-graph ./packages/agent-graph
COPY apps/worker ./apps/worker

RUN npm install -g pnpm@9

# Build packages in dependency order
RUN pnpm --filter @nexus-aec/shared-types build
RUN pnpm --filter @nexus-aec/logger build
RUN pnpm --filter @nexus-aec/encryption build
RUN pnpm --filter @nexus-aec/secure-storage build
RUN pnpm --filter @nexus-aec/intelligence build
RUN pnpm --filter @nexus-aec/email-providers build
RUN pnpm --filter @nexus-aec/agent-graph build
RUN pnpm --filter @nexus-aec/worker build

RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Stage 3: Runner
# -----------------------------------------------------------------------------
FROM node:20-slim AS runner

LABEL org.opencontainers.image.title="NexusAEC Worker"
LABEL org.opencontainers.image.description="Job-bus consumer running LangGraph graphs for NexusAEC"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.vendor="NexusAEC"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --shell /bin/bash worker

WORKDIR /app

# In a pnpm workspace each package has its OWN node_modules with symlinks to its
# declared deps; copy each package's node_modules so sibling requires resolve.
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=worker:nodejs /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder --chown=worker:nodejs /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder --chown=worker:nodejs /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=worker:nodejs /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/encryption/dist ./packages/encryption/dist
COPY --from=builder --chown=worker:nodejs /app/packages/encryption/package.json ./packages/encryption/
COPY --from=builder --chown=worker:nodejs /app/packages/encryption/node_modules ./packages/encryption/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/secure-storage/dist ./packages/secure-storage/dist
COPY --from=builder --chown=worker:nodejs /app/packages/secure-storage/package.json ./packages/secure-storage/
COPY --from=builder --chown=worker:nodejs /app/packages/secure-storage/node_modules ./packages/secure-storage/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/intelligence/dist ./packages/intelligence/dist
COPY --from=builder --chown=worker:nodejs /app/packages/intelligence/package.json ./packages/intelligence/
COPY --from=builder --chown=worker:nodejs /app/packages/intelligence/node_modules ./packages/intelligence/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/email-providers/dist ./packages/email-providers/dist
COPY --from=builder --chown=worker:nodejs /app/packages/email-providers/package.json ./packages/email-providers/
COPY --from=builder --chown=worker:nodejs /app/packages/email-providers/node_modules ./packages/email-providers/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/agent-graph/dist ./packages/agent-graph/dist
COPY --from=builder --chown=worker:nodejs /app/packages/agent-graph/package.json ./packages/agent-graph/
COPY --from=builder --chown=worker:nodejs /app/packages/agent-graph/node_modules ./packages/agent-graph/node_modules
COPY --from=builder --chown=worker:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=worker:nodejs /app/apps/worker/package.json ./apps/worker/
COPY --from=builder --chown=worker:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules

COPY --from=builder --chown=worker:nodejs /app/package.json ./

ENV NODE_ENV=production

USER worker

# Bus consumer — no HTTP port. Graceful shutdown on SIGTERM drains the loop.
CMD ["node", "apps/worker/dist/main.js"]
