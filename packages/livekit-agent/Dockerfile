# =============================================================================
# NexusAEC LiveKit Voice Agent - Production Dockerfile
# =============================================================================
#
# Multi-stage build for the LiveKit voice agent service.
# Optimized for small image size and fast startup.
#
# Build:
#   docker build -t nexus-aec-agent:latest -f packages/livekit-agent/Dockerfile .
#
# Run:
#   docker run --env-file .env nexus-aec-agent:latest
#
# Workspace dep graph (build order matters):
#   shared-types, logger, encryption  →  no internal deps
#   secure-storage                    →  encryption, shared-types
#   intelligence                      →  logger, shared-types
#   email-providers                   →  encryption, logger, secure-storage, shared-types
#   livekit-agent                     →  email-providers, intelligence, logger, shared-types
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-slim AS deps

# Install build dependencies for native modules (Debian/glibc — works with
# @livekit/rtc-node which only ships linux-x64-gnu binaries, not musl).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/encryption/package.json ./packages/encryption/
COPY packages/secure-storage/package.json ./packages/secure-storage/
COPY packages/intelligence/package.json ./packages/intelligence/
COPY packages/email-providers/package.json ./packages/email-providers/
COPY packages/livekit-agent/package.json ./packages/livekit-agent/

# Install pnpm
RUN npm install -g pnpm@9

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/packages/encryption/node_modules ./packages/encryption/node_modules
COPY --from=deps /app/packages/secure-storage/node_modules ./packages/secure-storage/node_modules
COPY --from=deps /app/packages/intelligence/node_modules ./packages/intelligence/node_modules
COPY --from=deps /app/packages/email-providers/node_modules ./packages/email-providers/node_modules
COPY --from=deps /app/packages/livekit-agent/node_modules ./packages/livekit-agent/node_modules

# Copy workspace manifests (required by `pnpm prune --prod` later)
COPY --from=deps /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/logger ./packages/logger
COPY packages/encryption ./packages/encryption
COPY packages/secure-storage ./packages/secure-storage
COPY packages/intelligence ./packages/intelligence
COPY packages/email-providers ./packages/email-providers
COPY packages/livekit-agent ./packages/livekit-agent

# Install pnpm for building
RUN npm install -g pnpm@9

# Build packages in dependency order
RUN pnpm --filter @nexus-aec/shared-types build
RUN pnpm --filter @nexus-aec/logger build
RUN pnpm --filter @nexus-aec/encryption build
RUN pnpm --filter @nexus-aec/secure-storage build
RUN pnpm --filter @nexus-aec/intelligence build
RUN pnpm --filter @nexus-aec/email-providers build
RUN pnpm --filter @nexus-aec/livekit-agent build

# Prune dev dependencies
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Stage 3: Runner
# -----------------------------------------------------------------------------
FROM node:20-slim AS runner

# Add labels for container metadata
LABEL org.opencontainers.image.title="NexusAEC Voice Agent"
LABEL org.opencontainers.image.description="LiveKit-based voice agent for NexusAEC"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.vendor="NexusAEC"

# Install runtime dependencies (Debian/glibc base — already has CA certs etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --shell /bin/bash agent

WORKDIR /app

# Copy built artifacts from builder.
#
# In a pnpm workspace, each package has its OWN node_modules with symlinks to
# its declared dependencies (this is pnpm's anti-phantom-dep design). The root
# /app/node_modules holds the .pnpm/ store but does NOT have all transitive
# deps hoisted. So we must copy each package's node_modules separately, or
# Node will fail to resolve sibling-package requires (e.g. intelligence's
# require('ioredis')).
COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=agent:nodejs /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder --chown=agent:nodejs /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder --chown=agent:nodejs /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=agent:nodejs /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/encryption/dist ./packages/encryption/dist
COPY --from=builder --chown=agent:nodejs /app/packages/encryption/package.json ./packages/encryption/
COPY --from=builder --chown=agent:nodejs /app/packages/encryption/node_modules ./packages/encryption/node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/secure-storage/dist ./packages/secure-storage/dist
COPY --from=builder --chown=agent:nodejs /app/packages/secure-storage/package.json ./packages/secure-storage/
COPY --from=builder --chown=agent:nodejs /app/packages/secure-storage/node_modules ./packages/secure-storage/node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/intelligence/dist ./packages/intelligence/dist
COPY --from=builder --chown=agent:nodejs /app/packages/intelligence/package.json ./packages/intelligence/
COPY --from=builder --chown=agent:nodejs /app/packages/intelligence/node_modules ./packages/intelligence/node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/email-providers/dist ./packages/email-providers/dist
COPY --from=builder --chown=agent:nodejs /app/packages/email-providers/package.json ./packages/email-providers/
COPY --from=builder --chown=agent:nodejs /app/packages/email-providers/node_modules ./packages/email-providers/node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/livekit-agent/dist ./packages/livekit-agent/dist
COPY --from=builder --chown=agent:nodejs /app/packages/livekit-agent/package.json ./packages/livekit-agent/
COPY --from=builder --chown=agent:nodejs /app/packages/livekit-agent/node_modules ./packages/livekit-agent/node_modules

# Copy package.json for workspace resolution
COPY --from=builder --chown=agent:nodejs /app/package.json ./

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose health check port
EXPOSE 8080

# Switch to non-root user
USER agent

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the agent
# The agent connects to LiveKit Cloud and waits for room assignments.
# - main.js (not index.js): index.js is the library entry (exports only),
#   main.js is the executable that calls startAgent().
# - "start" subcommand: cli.runApp() parses argv for commands (start | dev | connect).
#   Without it, the LiveKit CLI prints help and exits 0 — looks like a crash loop.
CMD ["node", "packages/livekit-agent/dist/main.js", "start"]
