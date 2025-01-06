#!/bin/bash

# Enterprise-grade deployment script for AWS ECS
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.0+
# - docker v24.0+
# - terraform v1.5+
# - snyk v1.0+

set -euo pipefail

# Global configuration
AWS_REGION=${AWS_REGION:-"us-west-1"}
PROJECT_NAME=${PROJECT_NAME:-"revenue-platform"}
DOCKER_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
LOG_LEVEL=${LOG_LEVEL:-"INFO"}
DEPLOYMENT_TIMEOUT=${DEPLOYMENT_TIMEOUT:-1800}
HEALTH_CHECK_RETRIES=${HEALTH_CHECK_RETRIES:-5}

# Logging configuration
log() {
    echo "[$(date +'%Y-%m-%dT%H:%M:%S%z')] [$1] $2"
}

error() {
    log "ERROR" "$1" >&2
    exit 1
}

# Check deployment prerequisites
check_prerequisites() {
    local environment=$1

    log "INFO" "Checking prerequisites for $environment deployment"

    # Verify AWS credentials
    aws sts get-caller-identity >/dev/null 2>&1 || error "AWS credentials not configured"

    # Check Docker daemon
    docker info >/dev/null 2>&1 || error "Docker daemon not running"

    # Verify Terraform installation
    terraform version >/dev/null 2>&1 || error "Terraform not installed"

    # Check environment variables
    [[ -z "${AWS_ACCOUNT_ID}" ]] && error "AWS_ACCOUNT_ID not set"
    [[ -z "${AWS_REGION}" ]] && error "AWS_REGION not set"

    # Verify security scanner
    snyk version >/dev/null 2>&1 || error "Snyk not installed"

    log "INFO" "Prerequisites check passed"
}

# Build and push Docker images
build_and_push_images() {
    local environment=$1
    local timestamp=$(date +%Y%m%d%H%M%S)

    log "INFO" "Building images for $environment"

    # Authenticate with ECR
    aws ecr get-login-password --region "${AWS_REGION}" | \
        docker login --username AWS --password-stdin "${DOCKER_REGISTRY}"

    # Build images in parallel
    local build_commands=(
        "docker build -f infrastructure/docker/api.Dockerfile -t ${DOCKER_REGISTRY}/${PROJECT_NAME}-api:${environment}-${timestamp} ."
        "docker build -f infrastructure/docker/web.Dockerfile -t ${DOCKER_REGISTRY}/${PROJECT_NAME}-web:${environment}-${timestamp} ."
        "docker build -f infrastructure/docker/worker.Dockerfile -t ${DOCKER_REGISTRY}/${PROJECT_NAME}-worker:${environment}-${timestamp} ."
    )

    for cmd in "${build_commands[@]}"; do
        eval "$cmd" &
    done
    wait

    # Security scan images
    for service in api web worker; do
        log "INFO" "Scanning ${service} image"
        snyk container test "${DOCKER_REGISTRY}/${PROJECT_NAME}-${service}:${environment}-${timestamp}" \
            --severity-threshold=high || error "Security scan failed for ${service}"
    done

    # Push images to ECR
    for service in api web worker; do
        log "INFO" "Pushing ${service} image"
        docker push "${DOCKER_REGISTRY}/${PROJECT_NAME}-${service}:${environment}-${timestamp}"
        docker tag "${DOCKER_REGISTRY}/${PROJECT_NAME}-${service}:${environment}-${timestamp}" \
                  "${DOCKER_REGISTRY}/${PROJECT_NAME}-${service}:${environment}-latest"
        docker push "${DOCKER_REGISTRY}/${PROJECT_NAME}-${service}:${environment}-latest"
    done
}

# Deploy infrastructure using Terraform
deploy_infrastructure() {
    local environment=$1

    log "INFO" "Deploying infrastructure for $environment"

    cd infrastructure/terraform/aws

    # Initialize Terraform
    terraform init -backend=true \
        -backend-config="bucket=${PROJECT_NAME}-terraform-state" \
        -backend-config="key=${environment}/terraform.tfstate" \
        -backend-config="region=${AWS_REGION}"

    # Select workspace
    terraform workspace select "$environment" || terraform workspace new "$environment"

    # Plan and apply changes
    terraform plan -out=tfplan
    terraform apply -auto-approve tfplan

    cd -
}

# Update ECS services
update_ecs_services() {
    local environment=$1
    local cluster_name="${PROJECT_NAME}-${environment}"

    log "INFO" "Updating ECS services in $cluster_name"

    for service in api web worker; do
        log "INFO" "Updating ${service} service"

        # Update task definition
        aws ecs update-service \
            --cluster "$cluster_name" \
            --service "${PROJECT_NAME}-${service}" \
            --force-new-deployment \
            --region "${AWS_REGION}"

        # Wait for service stability
        aws ecs wait services-stable \
            --cluster "$cluster_name" \
            --services "${PROJECT_NAME}-${service}" \
            --region "${AWS_REGION}"
    done
}

# Handle deployment rollback
handle_rollback() {
    local environment=$1
    local service=$2

    log "ERROR" "Initiating rollback for $service in $environment"

    # Revert to previous task definition
    local previous_task_def=$(aws ecs describe-task-definition \
        --task-definition "${PROJECT_NAME}-${service}" \
        --region "${AWS_REGION}" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)

    aws ecs update-service \
        --cluster "${PROJECT_NAME}-${environment}" \
        --service "${PROJECT_NAME}-${service}" \
        --task-definition "$previous_task_def" \
        --region "${AWS_REGION}"

    # Wait for rollback to complete
    aws ecs wait services-stable \
        --cluster "${PROJECT_NAME}-${environment}" \
        --services "${PROJECT_NAME}-${service}" \
        --region "${AWS_REGION}"

    log "INFO" "Rollback completed for $service"
}

# Main deployment function
main() {
    local environment=$1

    if [[ ! "$environment" =~ ^(development|staging|production)$ ]]; then
        error "Invalid environment. Must be development, staging, or production"
    }

    log "INFO" "Starting deployment to $environment"

    # Execute deployment steps
    check_prerequisites "$environment"

    trap 'handle_error $?' ERR

    build_and_push_images "$environment"
    deploy_infrastructure "$environment"
    update_ecs_services "$environment"

    log "INFO" "Deployment to $environment completed successfully"
}

# Error handler
handle_error() {
    local exit_code=$1
    log "ERROR" "Deployment failed with exit code $exit_code"
    exit "$exit_code"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -ne 1 ]]; then
        error "Usage: $0 <environment>"
    fi

    main "$1"
fi