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
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/encryption/package.json ./packages/encryption/
COPY packages/intelligence/package.json ./packages/intelligence/
COPY packages/livekit-agent/package.json ./packages/livekit-agent/

# Install pnpm
RUN npm install -g pnpm@9

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=deps /app/packages/encryption/node_modules ./packages/encryption/node_modules
COPY --from=deps /app/packages/intelligence/node_modules ./packages/intelligence/node_modules
COPY --from=deps /app/packages/livekit-agent/node_modules ./packages/livekit-agent/node_modules

# Copy source files
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/logger ./packages/logger
COPY packages/encryption ./packages/encryption
COPY packages/intelligence ./packages/intelligence
COPY packages/livekit-agent ./packages/livekit-agent

# Install pnpm for building
RUN npm install -g pnpm@9

# Build packages in dependency order
RUN pnpm --filter @nexus-aec/shared-types build
RUN pnpm --filter @nexus-aec/logger build
RUN pnpm --filter @nexus-aec/encryption build
RUN pnpm --filter @nexus-aec/intelligence build
RUN pnpm --filter @nexus-aec/livekit-agent build

# Prune dev dependencies
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Stage 3: Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Add labels for container metadata
LABEL org.opencontainers.image.title="NexusAEC Voice Agent"
LABEL org.opencontainers.image.description="LiveKit-based voice agent for NexusAEC"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.vendor="NexusAEC"

# Install runtime dependencies
RUN apk add --no-cache \
    libc6-compat \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 agent

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agent:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder --chown=agent:nodejs /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder --chown=agent:nodejs /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder --chown=agent:nodejs /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=agent:nodejs /app/packages/encryption/dist ./packages/encryption/dist
COPY --from=builder --chown=agent:nodejs /app/packages/encryption/package.json ./packages/encryption/
COPY --from=builder --chown=agent:nodejs /app/packages/intelligence/dist ./packages/intelligence/dist
COPY --from=builder --chown=agent:nodejs /app/packages/intelligence/package.json ./packages/intelligence/
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
# The agent connects to LiveKit Cloud and waits for room assignments
CMD ["node", "packages/livekit-agent/dist/index.js"]
