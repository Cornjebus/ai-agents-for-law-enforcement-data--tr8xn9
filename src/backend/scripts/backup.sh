#!/bin/bash

# Autonomous Revenue Generation Platform - Database Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.0+
# - postgresql-client v15+

set -euo pipefail

# Global Configuration
BACKUP_ROOT="${BACKUP_ROOT:-/tmp/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${LOG_FILE:-/var/log/platform/backup.log}"
TIMESTAMP_FORMAT="${TIMESTAMP_FORMAT:-+%Y%m%d_%H%M%S}"
MAX_RETRIES="${MAX_RETRIES:-3}"
BACKUP_TIMEOUT="${BACKUP_TIMEOUT:-3600}"
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"
COMPRESSION_LEVEL="${COMPRESSION_LEVEL:-9}"

# Load database configuration from TypeScript config
DB_HOST=$(node -e "require('../common/config/database.ts').DATABASE_CONFIG.host")
DB_PORT=$(node -e "require('../common/config/database.ts').DATABASE_CONFIG.port")
DB_NAME=$(node -e "require('../common/config/database.ts').DATABASE_CONFIG.database")
DB_USER=$(node -e "require('../common/config/database.ts').DATABASE_CONFIG.user")

# Initialize logging
initialize_logging() {
    local log_dir=$(dirname "$LOG_FILE")
    mkdir -p "$log_dir"
    chmod 750 "$log_dir"
    touch "$LOG_FILE"
    chmod 640 "$LOG_FILE"
}

# Logging function with ISO 8601 timestamps
log() {
    local level=$1
    local message=$2
    echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ")|${level}|${message}" >> "$LOG_FILE"
}

# Initialize backup environment
initialize_backup() {
    log "INFO" "Initializing backup environment"
    
    # Create backup directory structure
    mkdir -p "${BACKUP_ROOT}/{db,wal,metadata}"
    chmod 700 "${BACKUP_ROOT}"
    
    # Verify AWS CLI installation and configuration
    if ! command -v aws &> /dev/null; then
        log "ERROR" "AWS CLI not found"
        return 1
    fi
    
    # Verify PostgreSQL client tools
    if ! command -v pg_dump &> /dev/null; then
        log "ERROR" "PostgreSQL client tools not found"
        return 1
    }
    
    # Verify KMS key accessibility
    if ! aws kms describe-key --key-id "${KMS_KEY_ID}" &> /dev/null; then
        log "ERROR" "Unable to access KMS key"
        return 1
    }
    
    return 0
}

# Perform database backup with compression and encryption
perform_database_backup() {
    local timestamp=$(date "${TIMESTAMP_FORMAT}")
    local backup_file="${BACKUP_ROOT}/db/backup_${timestamp}.sql.gz"
    local metadata_file="${BACKUP_ROOT}/metadata/backup_${timestamp}.json"
    
    log "INFO" "Starting database backup to ${backup_file}"
    
    # Perform pg_dump with compression
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -Z "${COMPRESSION_LEVEL}" \
        -F c \
        -v \
        -f "${backup_file}" || {
            log "ERROR" "Database backup failed"
            return 1
        }
    
    # Calculate checksum
    local checksum=$(sha256sum "${backup_file}" | cut -d' ' -f1)
    
    # Create backup metadata
    cat > "${metadata_file}" << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "database": "${DB_NAME}",
    "size": "$(stat -f %z "${backup_file}")",
    "checksum": "${checksum}",
    "compression": "gzip",
    "encryption": "aws:kms"
}
EOF
    
    # Encrypt backup using KMS
    aws kms encrypt \
        --key-id "${KMS_KEY_ID}" \
        --plaintext fileb://"${backup_file}" \
        --output text \
        --query CiphertextBlob > "${backup_file}.encrypted"
    
    log "INFO" "Database backup completed successfully"
    return 0
}

# Archive WAL logs in parallel
backup_wal_logs() {
    local timestamp=$(date "${TIMESTAMP_FORMAT}")
    local wal_dir="${BACKUP_ROOT}/wal"
    
    log "INFO" "Starting WAL log archival"
    
    # Find and compress WAL logs in parallel
    find "${PGDATA}/pg_wal" -type f -name "*.wal" | \
    parallel -j "${PARALLEL_JOBS}" \
        "gzip -c {} > ${wal_dir}/{/.}_${timestamp}.gz"
    
    # Encrypt WAL archives
    find "${wal_dir}" -type f -name "*.gz" | \
    parallel -j "${PARALLEL_JOBS}" \
        "aws kms encrypt \
            --key-id ${KMS_KEY_ID} \
            --plaintext fileb://{} \
            --output text \
            --query CiphertextBlob > {}.encrypted"
    
    log "INFO" "WAL log archival completed"
    return 0
}

# Upload backup to S3 with cross-region replication
upload_to_s3() {
    local source_path=$1
    local s3_path=$2
    
    log "INFO" "Uploading ${source_path} to S3"
    
    # Upload with server-side encryption
    aws s3 cp "${source_path}" "s3://${BACKUP_BUCKET}/${s3_path}" \
        --sse aws:kms \
        --sse-kms-key-id "${KMS_KEY_ID}" \
        --metadata "checksum=$(sha256sum ${source_path} | cut -d' ' -f1)" || {
            log "ERROR" "S3 upload failed"
            return 1
        }
    
    # Verify upload
    if ! aws s3api head-object --bucket "${BACKUP_BUCKET}" --key "${s3_path}" &> /dev/null; then
        log "ERROR" "Upload verification failed"
        return 1
    }
    
    log "INFO" "Upload completed successfully"
    return 0
}

# Clean up old backups
cleanup_old_backups() {
    log "INFO" "Starting backup cleanup"
    
    # Clean local backups
    find "${BACKUP_ROOT}" -type f -mtime "+${RETENTION_DAYS}" -delete
    
    # Clean S3 backups
    aws s3 ls "s3://${BACKUP_BUCKET}" --recursive | \
    while read -r line; do
        createDate=$(echo "$line" | awk {'print $1" "$2'})
        createDate=$(date -d "$createDate" +%s)
        olderThan=$(date -d "-${RETENTION_DAYS} days" +%s)
        if [[ $createDate -lt $olderThan ]]; then
            fileName=$(echo "$line" | awk {'print $4'})
            aws s3 rm "s3://${BACKUP_BUCKET}/${fileName}"
        fi
    done
    
    log "INFO" "Backup cleanup completed"
    return 0
}

# Send notification
send_notification() {
    local status=$1
    local message=$2
    
    aws sns publish \
        --topic-arn "${SNS_TOPIC_ARN}" \
        --message "Backup ${status}: ${message}" \
        --subject "Database Backup Notification"
}

# Main backup orchestration
main() {
    local exit_code=0
    local start_time=$(date +%s)
    
    # Initialize backup environment
    if ! initialize_backup; then
        send_notification "FAILED" "Backup initialization failed"
        return 1
    fi
    
    # Perform database backup
    if ! perform_database_backup; then
        send_notification "FAILED" "Database backup failed"
        return 1
    fi
    
    # Archive WAL logs
    if ! backup_wal_logs; then
        send_notification "FAILED" "WAL archival failed"
        return 1
    fi
    
    # Upload backups to S3
    if ! upload_to_s3 "${BACKUP_ROOT}" "backups/$(date +%Y/%m/%d)"; then
        send_notification "FAILED" "S3 upload failed"
        return 1
    fi
    
    # Cleanup old backups
    if ! cleanup_old_backups; then
        log "WARN" "Backup cleanup failed"
        exit_code=1
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    send_notification "SUCCESS" "Backup completed in ${duration} seconds"
    return $exit_code
}

# Execute main function with timeout
timeout "${BACKUP_TIMEOUT}" main
exit $?