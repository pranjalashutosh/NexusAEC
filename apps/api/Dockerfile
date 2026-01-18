# =============================================================================
# NexusAEC API - Production Dockerfile
# =============================================================================
# Multi-stage build for optimized production image

# -----------------------------------------------------------------------------
# Stage 1: Dependencies
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy workspace package.json files
COPY apps/api/package.json ./apps/api/
COPY packages/logger/package.json ./packages/logger/
COPY packages/email-providers/package.json ./packages/email-providers/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/encryption/package.json ./packages/encryption/
COPY packages/secure-storage/package.json ./packages/secure-storage/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages

# Copy source files
COPY . .

# Build the API
WORKDIR /app/apps/api
RUN pnpm build

# -----------------------------------------------------------------------------
# Stage 3: Production Runner
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Add labels for container registry
LABEL org.opencontainers.image.title="NexusAEC API"
LABEL org.opencontainers.image.description="Backend API for NexusAEC Voice Assistant"
LABEL org.opencontainers.image.vendor="NexusAEC"

# Install pnpm for running the app
RUN corepack enable && corepack prepare pnpm@9 --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 api

WORKDIR /app

# Copy package files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Copy built API
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy workspace packages (built)
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/email-providers/package.json ./packages/email-providers/
COPY --from=builder /app/packages/email-providers/dist ./packages/email-providers/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /app/packages/shared-types/src ./packages/shared-types/src
COPY --from=builder /app/packages/encryption/package.json ./packages/encryption/
COPY --from=builder /app/packages/encryption/dist ./packages/encryption/dist
COPY --from=builder /app/packages/secure-storage/package.json ./packages/secure-storage/
COPY --from=builder /app/packages/secure-storage/dist ./packages/secure-storage/dist

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Set ownership
RUN chown -R api:nodejs /app

# Switch to non-root user
USER api

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the API
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
