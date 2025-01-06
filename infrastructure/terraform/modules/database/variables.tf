# Terraform version constraint
terraform {
  required_version = ">=1.5.0"
}

# Basic RDS instance configuration
variable "identifier" {
  type        = string
  description = "Unique identifier for the RDS instance"
}

variable "engine" {
  type        = string
  description = "Database engine type"
  default     = "postgres"
}

variable "engine_version" {
  type        = string
  description = "Database engine version"
  default     = "15.0"

  validation {
    condition     = can(regex("^\\d+\\.\\d+$", var.engine_version))
    error_message = "Engine version must be in format 'major.minor'"
  }
}

variable "instance_class" {
  type        = string
  description = "RDS instance type"
}

# Storage configuration
variable "allocated_storage" {
  type        = number
  description = "Allocated storage size in GB"
  default     = 100

  validation {
    condition     = var.allocated_storage >= 20
    error_message = "Allocated storage must be at least 20 GB"
  }
}

variable "storage_type" {
  type        = string
  description = "Storage type for RDS instance"
  default     = "gp3"
}

# Encryption configuration
variable "storage_encrypted" {
  type        = bool
  description = "Enable storage encryption"
  default     = true
}

variable "kms_key_id" {
  type        = string
  description = "KMS key ID for encryption"
  default     = ""
}

# High availability configuration
variable "multi_az" {
  type        = bool
  description = "Enable multi-AZ deployment"
  default     = true
}

variable "vpc_security_group_ids" {
  type        = list(string)
  description = "List of VPC security group IDs"
}

# Backup configuration
variable "backup_retention_period" {
  type        = number
  description = "Backup retention period in days"
  default     = 30

  validation {
    condition     = var.backup_retention_period >= 30
    error_message = "Backup retention period must be at least 30 days"
  }
}

variable "backup_window" {
  type        = string
  description = "Preferred backup window"
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  type        = string
  description = "Preferred maintenance window"
  default     = "Mon:04:00-Mon:05:00"
}

# Performance monitoring configuration
variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights"
  default     = true
}

variable "monitoring_interval" {
  type        = number
  description = "Enhanced monitoring interval in seconds"
  default     = 60

  validation {
    condition     = contains([0, 1, 5, 10, 15, 30, 60], var.monitoring_interval)
    error_message = "Monitoring interval must be one of [0, 1, 5, 10, 15, 30, 60]"
  }
}

variable "monitoring_role_arn" {
  type        = string
  description = "IAM role ARN for enhanced monitoring"
}

variable "enabled_cloudwatch_logs_exports" {
  type        = list(string)
  description = "List of log types to export to CloudWatch"
  default     = ["postgresql", "upgrade"]
}

# Protection and deletion configuration
variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection"
  default     = true
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Skip final snapshot on deletion"
  default     = false
}

variable "final_snapshot_identifier" {
  type        = string
  description = "Final snapshot identifier prefix"
}

# Database parameter configuration
variable "parameter_group_family" {
  type        = string
  description = "DB parameter group family"
  default     = "postgres15"
}

# Maintenance configuration
variable "auto_minor_version_upgrade" {
  type        = bool
  description = "Enable auto minor version upgrades"
  default     = true
}

variable "copy_tags_to_snapshot" {
  type        = bool
  description = "Copy tags to snapshots"
  default     = true
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
}