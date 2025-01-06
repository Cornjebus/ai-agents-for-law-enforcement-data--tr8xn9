# syntax=docker/dockerfile:1.4

# ===== Build Stage =====
FROM node:18-alpine AS builder
LABEL stage=builder

# Install system dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Create non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextjs

# Set working directory with proper permissions
WORKDIR /app
RUN chown nextjs:nodejs /app

# Install pnpm globally
RUN npm install -g pnpm@8

# Copy package files for layer caching
COPY --chown=nextjs:nodejs src/web/package.json src/web/pnpm-lock.yaml ./

# Install dependencies with frozen lockfile
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code and config files
COPY --chown=nextjs:nodejs src/web/ ./
COPY --chown=nextjs:nodejs src/web/next.config.ts ./
COPY --chown=nextjs:nodejs src/web/tsconfig.json ./
COPY --chown=nextjs:nodejs src/web/tailwind.config.ts ./

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Build application with optimizations
RUN pnpm build && \
    pnpm prune --prod

# ===== Runner Stage =====
FROM node:18-alpine AS runner
LABEL maintainer="DevOps Team" \
      version="1.0.0" \
      description="Production image for Next.js web application"

# Install system dependencies
RUN apk add --no-cache tini

# Create non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nextjs

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Copy built application from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Configure security headers
RUN echo "add_header X-Frame-Options 'DENY' always;" > /etc/nginx/conf.d/security-headers.conf && \
    echo "add_header X-Content-Type-Options 'nosniff' always;" >> /etc/nginx/conf.d/security-headers.conf && \
    echo "add_header Referrer-Policy 'strict-origin-when-cross-origin' always;" >> /etc/nginx/conf.d/security-headers.conf

# Set proper permissions
RUN chown -R nextjs:nodejs /app && \
    chmod -R 550 /app && \
    chmod -R 770 /app/.next/cache

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Start Next.js production server
CMD ["node", "server.js"]