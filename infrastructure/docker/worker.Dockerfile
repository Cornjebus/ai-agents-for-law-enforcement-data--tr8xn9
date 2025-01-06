# Stage 1: Builder stage for installing dependencies and setting up environment
FROM python:3.11-slim AS builder

# Version comments for key dependencies
# pytorch v2.0.0
# langchain v0.0.27

# Install system dependencies required for ML libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    torch==2.0.0 \
    langchain==0.0.27 \
    numpy \
    scipy \
    scikit-learn \
    pandas

# Copy model configurations and initialize cache directories
COPY models/ /app/models/
RUN mkdir -p /app/cache

# Stage 2: Production stage with optimized runtime
FROM python:3.11-slim

# Create non-root user for security
RUN groupadd -r ai_worker && useradd -r -g ai_worker ai_worker

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code and models
COPY --from=builder /app/models /app/models
COPY --chown=ai_worker:ai_worker . /app

# Set up environment variables
ENV PYTHON_ENV=production \
    MODEL_PATH=/app/models \
    CUDA_VISIBLE_DEVICES=0,1 \
    MODEL_CACHE_SIZE=2GB \
    PYTHONUNBUFFERED=1

# Create and set permissions for required directories
RUN mkdir -p /app/cache /app/models \
    && chown -R ai_worker:ai_worker /app \
    && chmod -R 755 /app

# Set up volumes
VOLUME ["/app/models", "/app/cache"]

# Switch to non-root user
USER ai_worker

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python /app/healthcheck.py

# Resource limits (these are soft limits, hard limits set in container runtime)
ENV NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Set Python path
ENV PYTHONPATH=/app

# Entry point configuration
ENTRYPOINT ["python", "-m"]
CMD ["worker.ai_processor"]

# Labels for container metadata
LABEL maintainer="DevOps Team" \
      version="1.0" \
      description="AI Worker Container for Autonomous Revenue Generation Platform" \
      org.opencontainers.image.source="https://github.com/org/repo" \
      org.opencontainers.image.documentation="https://docs.example.com/worker"