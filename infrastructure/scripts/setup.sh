#!/usr/bin/env bash

# setup.sh - Master infrastructure setup script for Autonomous Revenue Generation Platform
# Version: 1.0.0
# Required tools:
# - aws-cli v2.0+
# - terraform v1.5+
# - kubectl v1.25+
# - docker v24+

# Set strict shell options
set -euo pipefail
trap 'error_handler $? $LINENO $BASH_LINENO "$BASH_COMMAND" $(printf "::%s" ${FUNCNAME[@]:-})' ERR

# Global variables
SCRIPT_DIR=$(dirname "${BASH_SOURCE[0]}")
ROOT_DIR=$(dirname "$(dirname "$SCRIPT_DIR")")
ENV=${ENV:-production}
AWS_REGION=${AWS_REGION:-us-west-1}
TERRAFORM_DIR=$ROOT_DIR/infrastructure/terraform
KUBERNETES_DIR=$ROOT_DIR/infrastructure/kubernetes
LOG_DIR=$ROOT_DIR/logs
BACKUP_DIR=$ROOT_DIR/backups
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging setup
setup_logging() {
    mkdir -p "$LOG_DIR"
    exec 1> >(tee -a "${LOG_DIR}/setup_${TIMESTAMP}.log")
    exec 2> >(tee -a "${LOG_DIR}/setup_${TIMESTAMP}.error.log")
}

# Error handler
error_handler() {
    local exit_code=$1
    local line_no=$2
    local bash_lineno=$3
    local last_command=$4
    local func_stack=$5
    
    echo -e "${RED}Error occurred in script at line: ${line_no}${NC}"
    echo "Last command: ${last_command}"
    echo "Function stack: ${func_stack}"
    echo "Exit code: ${exit_code}"
    
    # Attempt cleanup if needed
    cleanup_on_error
    
    exit "${exit_code}"
}

# Cleanup function for error handling
cleanup_on_error() {
    echo -e "${YELLOW}Performing cleanup after error...${NC}"
    # Revert any incomplete changes
    if [[ -f "${BACKUP_DIR}/terraform.tfstate.backup" ]]; then
        cp "${BACKUP_DIR}/terraform.tfstate.backup" "${TERRAFORM_DIR}/environments/${ENV}/terraform.tfstate"
    fi
}

# Check prerequisites function
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check AWS CLI version
    if ! aws --version | grep -q "aws-cli/2"; then
        echo -e "${RED}AWS CLI v2.0+ is required${NC}"
        return 1
    fi
    
    # Check Terraform version
    if ! terraform version | grep -q "v1.5"; then
        echo -e "${RED}Terraform v1.5+ is required${NC}"
        return 1
    }
    
    # Check kubectl version
    if ! kubectl version --client | grep -q "v1.25"; then
        echo -e "${RED}kubectl v1.25+ is required${NC}"
        return 1
    }
    
    # Check Docker version
    if ! docker --version | grep -q "20.10"; then
        echo -e "${RED}Docker v20.10+ is required${NC}"
        return 1
    }
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        echo -e "${RED}Invalid AWS credentials${NC}"
        return 1
    }
    
    # Create required directories
    mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"
    
    echo -e "${GREEN}All prerequisites checked successfully${NC}"
    return 0
}

# Setup AWS infrastructure
setup_aws_infrastructure() {
    local environment=$1
    echo "Setting up AWS infrastructure for ${environment}..."
    
    # Backup existing state
    if [[ -f "${TERRAFORM_DIR}/environments/${environment}/terraform.tfstate" ]]; then
        cp "${TERRAFORM_DIR}/environments/${environment}/terraform.tfstate" \
           "${BACKUP_DIR}/terraform.tfstate.backup.${TIMESTAMP}"
    fi
    
    # Initialize Terraform
    cd "${TERRAFORM_DIR}/environments/${environment}"
    terraform init -backend=true -backend-config="region=${AWS_REGION}"
    
    # Validate Terraform configs
    terraform validate
    
    # Plan with cost estimation
    terraform plan -out=tfplan -detailed-exitcode
    
    # Apply if validation passes
    terraform apply -auto-approve tfplan
    
    echo -e "${GREEN}AWS infrastructure setup completed${NC}"
    return 0
}

# Setup container registry
setup_container_registry() {
    echo "Setting up container registry..."
    
    # Create ECR repositories
    local repositories=("api-service" "frontend" "worker")
    for repo in "${repositories[@]}"; do
        aws ecr create-repository \
            --repository-name "${repo}" \
            --image-scanning-configuration scanOnPush=true \
            --encryption-configuration encryptionType=KMS \
            --image-tag-mutability IMMUTABLE
        
        # Set lifecycle policy
        aws ecr put-lifecycle-policy \
            --repository-name "${repo}" \
            --lifecycle-policy-text file://"${ROOT_DIR}/infrastructure/ecr/lifecycle-policy.json"
    done
    
    echo -e "${GREEN}Container registry setup completed${NC}"
    return 0
}

# Setup Kubernetes infrastructure
setup_kubernetes() {
    local environment=$1
    echo "Setting up Kubernetes infrastructure for ${environment}..."
    
    # Apply namespace configuration
    kubectl apply -f "${KUBERNETES_DIR}/base/namespace.yaml"
    
    # Apply security policies
    kubectl apply -f "${KUBERNETES_DIR}/security/"
    
    # Setup monitoring
    kubectl apply -f "${KUBERNETES_DIR}/monitoring/"
    
    # Setup ingress controllers
    kubectl apply -f "${KUBERNETES_DIR}/ingress/"
    
    # Validate cluster health
    kubectl get nodes
    kubectl get pods --all-namespaces
    
    echo -e "${GREEN}Kubernetes infrastructure setup completed${NC}"
    return 0
}

# Main execution
main() {
    echo "Starting infrastructure setup..."
    
    # Setup logging
    setup_logging
    
    # Check prerequisites
    check_prerequisites || exit 1
    
    # Create backup directory
    mkdir -p "${BACKUP_DIR}"
    
    # Setup AWS infrastructure
    setup_aws_infrastructure "${ENV}"
    
    # Setup container registry
    setup_container_registry
    
    # Setup Kubernetes infrastructure
    setup_kubernetes "${ENV}"
    
    echo -e "${GREEN}Infrastructure setup completed successfully${NC}"
    
    # Display next steps
    cat << EOF
Next steps:
1. Verify all services are running: kubectl get pods --all-namespaces
2. Check monitoring dashboard: kubectl port-forward svc/grafana 3000:3000 -n monitoring
3. Review security configurations: aws securityhub get-findings
4. Setup CI/CD pipelines using the generated configurations
EOF
}

# Execute main function
main "$@"