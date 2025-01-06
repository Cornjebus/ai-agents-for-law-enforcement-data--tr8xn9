# Builder stage
FROM python:3.11-slim AS builder

# Set build arguments
ARG PYTHON_VERSION=3.11
ARG ENVIRONMENT=production
ARG BUILD_DATE

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Set working directory
WORKDIR /app

# Install build dependencies and security tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements files
COPY requirements*.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$ENVIRONMENT" = "development" ]; then \
       pip install --no-cache-dir -r requirements.dev.txt; \
    fi

# Run security scan on dependencies
RUN pip install safety && safety check

# Copy application source code
COPY . .

# Run static code analysis
RUN pip install bandit && bandit -r /app/src

# Clean up build dependencies
RUN apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*

# Production stage
FROM python:3.11-slim

# Set build arguments
ARG ENVIRONMENT=production
ARG BUILD_DATE
ARG SCAN_DATE

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    MAX_WORKERS=4 \
    ENVIRONMENT=production

# Set working directory
WORKDIR /app

# Create non-root user and group
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/bash -m appuser

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from builder
COPY --from=builder --chown=appuser:appgroup /app /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Configure security headers and limits
RUN echo "* soft nofile 65535" >> /etc/security/limits.conf && \
    echo "* hard nofile 65535" >> /etc/security/limits.conf && \
    echo "* soft nproc 4096" >> /etc/security/limits.conf && \
    echo "* hard nproc 4096" >> /etc/security/limits.conf

# Set file permissions
RUN chmod 755 /app && \
    chmod -R 644 /app/src && \
    chmod -R 664 /app/logs && \
    chmod 600 /app/secrets/* || true

# Create required directories with proper permissions
RUN mkdir -p /app/static /app/media /app/logs && \
    chown -R appuser:appgroup /app/static /app/media /app/logs

# Enable core dumps for debugging
RUN echo "/tmp/cores/core.%e.%p.%h.%t" > /proc/sys/kernel/core_pattern && \
    mkdir -p /tmp/cores && \
    chmod 777 /tmp/cores

# Switch to non-root user
USER appuser

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c 'import urllib.request; urllib.request.urlopen("http://localhost:8000/health")'

# Expose port
EXPOSE 8000

# Set volumes
VOLUME ["/app/static", "/app/media", "/app/logs"]

# Add metadata labels
LABEL maintainer="DevOps Team <devops@company.com>" \
    version="1.0.0" \
    environment="${ENVIRONMENT}" \
    build_date="${BUILD_DATE}" \
    security.scan_date="${SCAN_DATE}"

# Set entry point with proper signal handling
ENTRYPOINT ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0"]
CMD ["--port", "8000", "--workers", "4"]