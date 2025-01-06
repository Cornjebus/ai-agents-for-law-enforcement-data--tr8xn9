#!/bin/bash

# Infrastructure-level backup script for Autonomous Revenue Generation Platform
# Version: 1.0.0
# Required tools:
# - aws-cli v2.0+
# - pg_dump v15+
# - zstd v1.5+

set -euo pipefail

# Global variables
export BACKUP_ROOT="${BACKUP_ROOT:-/opt/platform/backups}"
export RETENTION_DAYS="${RETENTION_DAYS:-30}"
export WAL_RETENTION_HOURS="${WAL_RETENTION_HOURS:-24}"
export LOG_FILE="${LOG_FILE:-/var/log/platform/infrastructure-backup.log}"
export AUDIT_LOG="${AUDIT_LOG:-/var/log/platform/backup-audit.log}"
export TIMESTAMP=$(date +%Y%m%d_%H%M%S)
export ENV="${ENVIRONMENT:-production}"
export COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-3}"
export MAX_RETRIES="${MAX_RETRIES:-3}"
export BACKUP_TIMEOUT="${BACKUP_TIMEOUT:-3600}"

# Logging functions
log() {
    local level="$1"
    local message="$2"
    echo "$(date '+%Y-%m-%d %H:%M:%S')|${level}|${message}" >> "${LOG_FILE}"
}

audit_log() {
    local operation="$1"
    local details="$2"
    echo "$(date '+%Y-%m-%d %H:%M:%S')|${operation}|${details}|$(whoami)" >> "${AUDIT_LOG}"
}

# Initialize backup environment
initialize_backup() {
    log "INFO" "Initializing backup environment"
    
    # Create required directories with secure permissions
    mkdir -p "${BACKUP_ROOT}/{db,config,state,wal}" 2>/dev/null || true
    chmod 700 "${BACKUP_ROOT}"
    
    # Verify AWS credentials and KMS access
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "AWS credentials not configured properly"
        return 1
    }
    
    # Verify required tools
    for tool in aws pg_dump zstd; do
        if ! command -v "${tool}" >/dev/null 2>&1; then
            log "ERROR" "Required tool not found: ${tool}"
            return 1
        fi
    done
    
    # Setup cleanup trap
    trap cleanup EXIT
    
    log "INFO" "Backup environment initialized successfully"
    return 0
}

# WAL archiving function
backup_wal_logs() {
    local db_name="$1"
    local wal_location="$2"
    local retries=0
    
    log "INFO" "Starting WAL archive for ${db_name}"
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if pg_receivewal -D "${BACKUP_ROOT}/wal/${db_name}" \
            --create-slot --slot="${db_name}_backup" 2>/dev/null; then
            
            # Compress and encrypt WAL files
            find "${BACKUP_ROOT}/wal/${db_name}" -type f -name "*.wal" | while read -r wal_file; do
                zstd -"${COMPRESSION_LEVEL}" "${wal_file}" -o "${wal_file}.zst"
                
                # Upload to S3 with KMS encryption
                aws s3 cp "${wal_file}.zst" \
                    "s3://${wal_location}/${db_name}/$(basename "${wal_file}").zst" \
                    --sse aws:kms \
                    --sse-kms-key-id "${KMS_KEY_ID}"
                
                audit_log "WAL_ARCHIVE" "${db_name}:$(basename "${wal_file}")"
            done
            return 0
        fi
        
        retries=$((retries + 1))
        sleep 5
    done
    
    log "ERROR" "Failed to archive WAL logs for ${db_name} after ${MAX_RETRIES} attempts"
    return 1
}

# Backup verification function
verify_backup_integrity() {
    local backup_path="$1"
    local checksum_file="$2"
    
    log "INFO" "Verifying backup integrity: ${backup_path}"
    
    # Calculate and verify checksums
    sha256sum "${backup_path}" > "${checksum_file}"
    
    # Verify KMS encryption
    if ! aws s3api head-object \
        --bucket "${S3_BUCKET}" \
        --key "$(basename "${backup_path}")" \
        --query 'ServerSideEncryption' | grep -q "aws:kms"; then
        log "ERROR" "KMS encryption verification failed for ${backup_path}"
        return 1
    fi
    
    audit_log "VERIFY_BACKUP" "Integrity check passed: ${backup_path}"
    return 0
}

# Cross-region replication function
replicate_to_secondary() {
    local source_path="$1"
    local destination_region="$2"
    
    log "INFO" "Starting cross-region replication to ${destination_region}"
    
    # Copy to secondary region with re-encryption
    aws s3 cp \
        "s3://${S3_BUCKET}/$(basename "${source_path}")" \
        "s3://${S3_BUCKET_REPLICA}/$(basename "${source_path}")" \
        --source-region "${AWS_REGION}" \
        --region "${destination_region}" \
        --sse aws:kms \
        --sse-kms-key-id "${KMS_KEY_ID_REPLICA}"
        
    audit_log "REPLICATE" "Replicated to ${destination_region}: ${source_path}"
    return 0
}

# S3 upload function with encryption
upload_to_s3() {
    local source_path="$1"
    local s3_path="$2"
    local retries=0
    
    log "INFO" "Uploading to S3: ${source_path}"
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if aws s3 cp "${source_path}" "${s3_path}" \
            --sse aws:kms \
            --sse-kms-key-id "${KMS_KEY_ID}" \
            --expected-size "$(stat -f%z "${source_path}")"; then
            
            audit_log "UPLOAD" "Successfully uploaded: ${s3_path}"
            return 0
        fi
        
        retries=$((retries + 1))
        sleep 5
    done
    
    log "ERROR" "Failed to upload ${source_path} after ${MAX_RETRIES} attempts"
    return 1
}

# Cleanup old backups
cleanup_old_backups() {
    local retention_days="$1"
    
    log "INFO" "Cleaning up backups older than ${retention_days} days"
    
    # Clean local backups
    find "${BACKUP_ROOT}" -type f -mtime "+${retention_days}" -delete
    
    # Clean S3 backups
    aws s3 ls "s3://${S3_BUCKET}" --recursive | while read -r line; do
        if [[ $(echo "$line" | awk '{print $1}') < $(date -d "-${retention_days} days" '+%Y-%m-%d') ]]; then
            aws s3 rm "s3://${S3_BUCKET}/$(echo "$line" | awk '{print $4}')"
        fi
    done
    
    audit_log "CLEANUP" "Removed backups older than ${retention_days} days"
}

# Cleanup function
cleanup() {
    log "INFO" "Performing cleanup"
    rm -f "${BACKUP_ROOT}"/*.tmp
    trap - EXIT
}

# Main backup function
main() {
    local exit_code=0
    
    log "INFO" "Starting backup process - ${TIMESTAMP}"
    
    # Initialize backup environment
    if ! initialize_backup; then
        log "ERROR" "Backup initialization failed"
        return 1
    fi
    
    # Backup infrastructure state
    if ! tar czf "${BACKUP_ROOT}/state/terraform-${TIMESTAMP}.tar.gz" \
        -C "${BACKUP_ROOT}/../terraform/environments/${ENV}" .; then
        log "ERROR" "Failed to backup Terraform state"
        exit_code=1
    fi
    
    # Backup WAL logs if enabled
    if [ "${ENABLE_WAL_ARCHIVE:-true}" = "true" ]; then
        backup_wal_logs "main" "${WAL_S3_PATH}" || exit_code=1
    fi
    
    # Upload backups to S3
    find "${BACKUP_ROOT}" -type f -name "*.tar.gz" | while read -r backup_file; do
        upload_to_s3 "${backup_file}" \
            "s3://${S3_BUCKET}/$(basename "${backup_file}")" || exit_code=1
    done
    
    # Verify backup integrity
    find "${BACKUP_ROOT}" -type f -name "*.tar.gz" | while read -r backup_file; do
        verify_backup_integrity "${backup_file}" \
            "${backup_file}.sha256" || exit_code=1
    done
    
    # Replicate to secondary region
    if [ "${ENABLE_CROSS_REGION:-true}" = "true" ]; then
        find "${BACKUP_ROOT}" -type f -name "*.tar.gz" | while read -r backup_file; do
            replicate_to_secondary "${backup_file}" \
                "${SECONDARY_REGION}" || exit_code=1
        done
    fi
    
    # Cleanup old backups
    cleanup_old_backups "${RETENTION_DAYS}"
    
    log "INFO" "Backup process completed with exit code ${exit_code} - ${TIMESTAMP}"
    return "${exit_code}"
}

# Execute main function
main "$@"