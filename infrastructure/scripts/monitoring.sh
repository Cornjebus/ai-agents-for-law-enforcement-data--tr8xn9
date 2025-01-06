#!/bin/bash

# Autonomous Revenue Generation Platform - Monitoring Setup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli ^2.0.0
# - datadog-agent ^7.0.0
# - prometheus-node-exporter ^1.0.0

set -euo pipefail

# Configuration Variables
AWS_REGION=${AWS_REGION:-"us-west-2"}
DD_API_KEY=${DD_API_KEY:-""}
DD_APP_KEY=${DD_APP_KEY:-""}
PROMETHEUS_PORT=${PROMETHEUS_PORT:-9090}
RETRY_ATTEMPTS=3
HEALTH_CHECK_INTERVAL=60

# Performance thresholds (in ms)
API_LATENCY_THRESHOLD=100
VOICE_PROCESSING_THRESHOLD=200
CONTENT_GENERATION_THRESHOLD=2000
DB_QUERY_THRESHOLD=10

# Security thresholds
MAX_REQUEST_RATE=1000
MAX_AUTH_FAILURES=5
MAX_DATA_ACCESS_ATTEMPTS=100

# Logging setup
LOG_DIR="/var/log/revenue-platform"
SCRIPT_LOG="${LOG_DIR}/monitoring-setup.log"

# Create log directory if it doesn't exist
mkdir -p "${LOG_DIR}"

# Logging function
log() {
    local level=$1
    shift
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] $*" | tee -a "${SCRIPT_LOG}"
}

# Error handling
error_handler() {
    local line_no=$1
    local error_code=$2
    log "ERROR" "Error occurred in script at line ${line_no} (Exit code: ${error_code})"
    cleanup
    exit "${error_code}"
}

trap 'error_handler ${LINENO} $?' ERR

# Validation functions
validate_aws_credentials() {
    log "INFO" "Validating AWS credentials..."
    if ! aws sts get-caller-identity &>/dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    fi
}

validate_datadog_keys() {
    log "INFO" "Validating Datadog API keys..."
    if [[ -z "${DD_API_KEY}" ]] || [[ -z "${DD_APP_KEY}" ]]; then
        log "ERROR" "Datadog API keys not set"
        return 1
    fi
    
    # Verify keys with Datadog API
    if ! curl -X GET "https://api.datadoghq.com/api/v1/validate" \
        -H "DD-API-KEY: ${DD_API_KEY}" \
        -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" &>/dev/null; then
        log "ERROR" "Invalid Datadog API keys"
        return 1
    fi
}

# CloudWatch setup
setup_cloudwatch() {
    log "INFO" "Setting up CloudWatch monitoring..."
    
    # Create log groups with encryption
    aws logs create-log-group --log-group-name "/revenue-platform/api" \
        --kms-key-id "alias/aws/logs" --region "${AWS_REGION}"
    
    # Set up metric filters
    aws logs put-metric-filter \
        --log-group-name "/revenue-platform/api" \
        --filter-name "ApiLatencyFilter" \
        --filter-pattern "[timestamp, requestId, latency]" \
        --metric-transformations \
            metricName=ApiLatency,metricNamespace=RevenueAutomation,metricValue=$latency
    
    # Configure alarms
    aws cloudwatch put-metric-alarm \
        --alarm-name "HighApiLatency" \
        --metric-name "ApiLatency" \
        --namespace "RevenueAutomation" \
        --statistic "Average" \
        --period 60 \
        --evaluation-periods 2 \
        --threshold "${API_LATENCY_THRESHOLD}" \
        --comparison-operator "GreaterThanThreshold" \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:monitoring-alerts"
}

# Datadog setup
setup_datadog() {
    log "INFO" "Setting up Datadog monitoring..."
    
    # Install Datadog agent
    DD_API_KEY="${DD_API_KEY}" DD_SITE="datadoghq.com" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script_agent7.sh)"
    
    # Configure agent
    cat > /etc/datadog-agent/datadog.yaml <<EOF
api_key: ${DD_API_KEY}
site: datadoghq.com
logs_enabled: true
apm_config:
    enabled: true
process_config:
    enabled: true
EOF
    
    # Configure APM
    cat > /etc/datadog-agent/conf.d/apm.yaml <<EOF
apm_config:
    enabled: true
    log_file: /var/log/datadog/trace-agent.log
    receiver_port: 8126
    max_memory: 500000000
    max_cpu_percent: 50
EOF
    
    # Restart agent
    systemctl restart datadog-agent
}

# Prometheus setup
setup_prometheus() {
    log "INFO" "Setting up Prometheus monitoring..."
    
    # Create Prometheus configuration
    cat > /etc/prometheus/prometheus.yml <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  - job_name: 'revenue-platform'
    static_configs:
      - targets: ['localhost:${PROMETHEUS_PORT}']
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'revenue_automation_.*'
        action: keep
EOF
    
    # Create alert rules
    cat > /etc/prometheus/rules/alerts.yml <<EOF
groups:
- name: revenue-platform
  rules:
  - alert: HighApiLatency
    expr: revenue_automation_api_response_time > ${API_LATENCY_THRESHOLD}
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: High API latency detected
EOF
    
    # Start Prometheus
    systemctl restart prometheus
}

# Health check function
check_monitoring_health() {
    log "INFO" "Performing health checks..."
    local health_status=0
    
    # Check CloudWatch
    if ! aws cloudwatch list-metrics --namespace "RevenueAutomation" &>/dev/null; then
        log "ERROR" "CloudWatch health check failed"
        health_status=1
    fi
    
    # Check Datadog
    if ! curl -X GET "https://api.datadoghq.com/api/v1/validate" \
        -H "DD-API-KEY: ${DD_API_KEY}" \
        -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" &>/dev/null; then
        log "ERROR" "Datadog health check failed"
        health_status=1
    fi
    
    # Check Prometheus
    if ! curl -s "http://localhost:${PROMETHEUS_PORT}/-/healthy" &>/dev/null; then
        log "ERROR" "Prometheus health check failed"
        health_status=1
    fi
    
    return "${health_status}"
}

# Cleanup function
cleanup() {
    log "INFO" "Performing cleanup..."
    # Add cleanup tasks if needed
}

# Main setup function
main() {
    log "INFO" "Starting monitoring setup..."
    
    # Validate credentials
    validate_aws_credentials
    validate_datadog_keys
    
    # Setup monitoring services
    setup_cloudwatch
    setup_datadog
    setup_prometheus
    
    # Initial health check
    if ! check_monitoring_health; then
        log "ERROR" "Initial health check failed"
        exit 1
    fi
    
    # Set up periodic health checks
    (
        while true; do
            sleep "${HEALTH_CHECK_INTERVAL}"
            check_monitoring_health
        done
    ) &
    
    log "INFO" "Monitoring setup completed successfully"
}

# Script execution
main "$@"