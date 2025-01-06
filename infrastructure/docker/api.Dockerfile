# Stage 1: Builder
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install build essentials and Node.js 18.x
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@8

# Copy package files with correct ownership
COPY --chown=node:node package.json pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy source code and TypeScript config
COPY --chown=node:node . .

# Build TypeScript code with optimizations
RUN pnpm run build

# Install Python dependencies with pip
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Run security scans
RUN pnpm audit && \
    pip install safety && \
    safety check

# Clean up build artifacts and caches
RUN pnpm cache clean --force && \
    rm -rf /root/.cache/pip

# Stage 2: Production
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Create non-root user/group
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/bash -m appuser

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from builder
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Set strict file permissions
RUN chmod -R 755 /app && \
    chown -R appuser:appgroup /app

# Configure health checks
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Setup resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV PYTHONUNBUFFERED=1

# Configure logging
ENV NODE_ENV=production
ENV PYTHON_ENV=production

# Expose ports
EXPOSE 3000 9090

# Set secure volumes
VOLUME ["/app", "/app/node_modules", "/tmp"]

# Switch to non-root user
USER appuser

# Set security options
LABEL security.capabilities='{"drop":["ALL"],"add":["NET_BIND_SERVICE"]}'
LABEL security.seccomp=unconfined
LABEL security.read-only=true

# Set entrypoint and command
ENTRYPOINT ["node"]
CMD ["dist/index.js"]