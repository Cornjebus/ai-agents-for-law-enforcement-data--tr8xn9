#!/usr/bin/env bash

# setup.sh - Backend Development Environment Setup Script
# Version: 1.0.0
# Requires: bash 5.0+, docker 24+, docker-compose 3.8+, node 18.0+, pnpm 8.0+

# Enable strict mode
set -euo pipefail
IFS=$'\n\t'

# Script constants
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
ROOT_DIR=$(dirname "$SCRIPT_DIR")
LOG_FILE="$ROOT_DIR/setup.log"
REQUIRED_PORTS=(5432 6379 3000 4000)

# Color constants
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local log_entry="[$timestamp] [$level] $message"
    
    case $level in
        "INFO")
            echo -e "${GREEN}${log_entry}${NC}"
            ;;
        "WARN")
            echo -e "${YELLOW}${log_entry}${NC}"
            ;;
        "ERROR")
            echo -e "${RED}${log_entry}${NC}"
            ;;
    esac
    
    echo "$log_entry" >> "$LOG_FILE"
}

# Prerequisites check
check_prerequisites() {
    log_message "INFO" "Checking prerequisites..."
    
    # Check bash version
    if [[ "${BASH_VERSION:0:1}" -lt 5 ]]; then
        log_message "ERROR" "Bash version 5.0+ required"
        return 1
    fi
    
    # Check Docker installation
    if ! command -v docker &> /dev/null; then
        log_message "ERROR" "Docker is not installed"
        return 1
    fi
    
    # Verify Docker daemon is running
    if ! docker info &> /dev/null; then
        log_message "ERROR" "Docker daemon is not running"
        return 1
    }
    
    # Check docker-compose version
    if ! command -v docker-compose &> /dev/null; then
        log_message "ERROR" "docker-compose is not installed"
        return 1
    fi
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_message "ERROR" "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
    if [[ "$node_version" -lt 18 ]]; then
        log_message "ERROR" "Node.js version 18+ required"
        return 1
    fi
    
    # Check pnpm installation
    if ! command -v pnpm &> /dev/null; then
        log_message "ERROR" "pnpm is not installed"
        return 1
    fi
    
    # Check disk space (minimum 10GB free)
    local free_space=$(df -BG "$ROOT_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ "$free_space" -lt 10 ]]; then
        log_message "ERROR" "Insufficient disk space. 10GB minimum required"
        return 1
    fi
    
    # Check port availability
    for port in "${REQUIRED_PORTS[@]}"; do
        if lsof -i ":$port" &> /dev/null; then
            log_message "ERROR" "Port $port is already in use"
            return 1
        fi
    done
    
    # Check write permissions
    if [[ ! -w "$ROOT_DIR" ]]; then
        log_message "ERROR" "No write permission in $ROOT_DIR"
        return 1
    fi
    
    log_message "INFO" "Prerequisites check passed"
    return 0
}

# Environment setup
setup_environment() {
    log_message "INFO" "Setting up environment..."
    
    # Backup existing .env if it exists
    if [[ -f "$ROOT_DIR/.env" ]]; then
        cp "$ROOT_DIR/.env" "$ROOT_DIR/.env.backup"
    fi
    
    # Copy .env.example if .env doesn't exist
    if [[ ! -f "$ROOT_DIR/.env" ]]; then
        cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    fi
    
    # Generate secure random values
    local jwt_secret=$(openssl rand -hex 32)
    local api_key=$(openssl rand -hex 32)
    
    # Update environment variables
    sed -i.bak \
        -e "s/JWT_SECRET=.*/JWT_SECRET=$jwt_secret/" \
        -e "s/API_KEY=.*/API_KEY=$api_key/" \
        "$ROOT_DIR/.env"
    
    # Set restrictive permissions on .env
    chmod 600 "$ROOT_DIR/.env"
    
    log_message "INFO" "Environment setup completed"
    return 0
}

# Dependencies installation
install_dependencies() {
    log_message "INFO" "Installing dependencies..."
    
    # Configure pnpm
    pnpm config set store-dir "$ROOT_DIR/.pnpm-store"
    
    # Clean install if specified
    if [[ "${1:-}" == "--clean" ]]; then
        rm -rf "$ROOT_DIR/node_modules"
        rm -rf "$ROOT_DIR/.pnpm-store"
    fi
    
    # Install dependencies
    cd "$ROOT_DIR"
    pnpm install --frozen-lockfile
    
    # Check for vulnerabilities
    pnpm audit
    
    # Build packages
    pnpm run build
    
    log_message "INFO" "Dependencies installation completed"
    return 0
}

# Database setup
setup_database() {
    log_message "INFO" "Setting up database..."
    
    # Start PostgreSQL container
    docker-compose up -d postgres
    
    # Wait for database to be ready
    local max_attempts=30
    local attempt=1
    
    while ! docker-compose exec -T postgres pg_isready &> /dev/null; do
        if [[ $attempt -eq $max_attempts ]]; then
            log_message "ERROR" "Database failed to start"
            return 1
        fi
        log_message "INFO" "Waiting for database... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    # Run migrations
    pnpm run migrate
    
    # Seed initial data
    pnpm run seed
    
    log_message "INFO" "Database setup completed"
    return 0
}

# Start services
start_services() {
    log_message "INFO" "Starting services..."
    
    # Pull latest images
    docker-compose pull
    
    # Start all services
    docker-compose up -d
    
    # Check service health
    local services=("api" "redis" "postgres")
    for service in "${services[@]}"; do
        if ! docker-compose ps "$service" | grep -q "Up"; then
            log_message "ERROR" "Service $service failed to start"
            return 1
        fi
    done
    
    log_message "INFO" "Services started successfully"
    return 0
}

# Cleanup function
cleanup() {
    local exit_code=$?
    
    if [[ $exit_code -ne 0 ]]; then
        log_message "ERROR" "Setup failed. Cleaning up..."
        
        # Stop containers
        docker-compose down
        
        # Restore .env backup if exists
        if [[ -f "$ROOT_DIR/.env.backup" ]]; then
            mv "$ROOT_DIR/.env.backup" "$ROOT_DIR/.env"
        fi
        
        # Remove temporary files
        rm -f "$ROOT_DIR/.env.bak"
    fi
    
    exit $exit_code
}

# Main execution
main() {
    # Initialize log file
    : > "$LOG_FILE"
    chmod 600 "$LOG_FILE"
    
    log_message "INFO" "Starting backend setup..."
    
    # Register cleanup trap
    trap cleanup EXIT
    
    # Execute setup steps
    check_prerequisites || exit 1
    setup_environment || exit 1
    install_dependencies "$@" || exit 1
    setup_database || exit 1
    start_services || exit 1
    
    log_message "INFO" "Backend setup completed successfully"
    
    # Display access information
    echo -e "\n${GREEN}Setup completed successfully!${NC}"
    echo -e "API: http://localhost:3000"
    echo -e "Database: localhost:5432"
    echo -e "Redis: localhost:6379"
    echo -e "Logs: $LOG_FILE\n"
}

main "$@"