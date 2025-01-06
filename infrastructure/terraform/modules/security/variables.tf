# Terraform AWS Security Module Variables
# Version: 1.0
# Provider version requirements: hashicorp/terraform ~> 1.0

# Region Configuration
variable "aws_region" {
  description = "AWS region where security resources will be created (must be compliant with data residency requirements)"
  type        = string
  default     = "us-west-1"

  validation {
    condition     = can(regex("^(us-west-1|us-west-2|us-east-1|us-east-2)$", var.aws_region))
    error_message = "Region must be compliant with data residency requirements"
  }
}

# VPC Configuration
variable "vpc_id" {
  description = "ID of the VPC where security groups will be created (required for network isolation)"
  type        = string
  sensitive   = true
}

# Environment Configuration
variable "environment" {
  description = "Environment name for resource tagging with specific security controls per environment"
  type        = string

  validation {
    condition     = can(regex("^(development|staging|production)$", var.environment))
    error_message = "Environment must be development, staging, or production"
  }
}

# Project Configuration
variable "project_name" {
  description = "Name of the project for resource naming and tagging (used in security resource identification)"
  type        = string
  default     = "autonomous-revenue-platform"

  validation {
    condition     = can(regex("^[a-zA-Z0-9-]+$", var.project_name))
    error_message = "Project name must contain only alphanumeric characters and hyphens"
  }
}

# WAF Configuration
variable "enable_waf" {
  description = "Flag to enable/disable WAF protection (recommended enabled for production)"
  type        = bool
  default     = true
}

variable "waf_rate_limit" {
  description = "Maximum number of requests allowed per 5 minutes per IP (DDoS protection)"
  type        = number
  default     = 2000

  validation {
    condition     = var.waf_rate_limit >= 1000 && var.waf_rate_limit <= 10000
    error_message = "WAF rate limit must be between 1000 and 10000 requests"
  }
}

# KMS Configuration
variable "enable_kms_encryption" {
  description = "Flag to enable/disable KMS encryption for sensitive data (required for compliance)"
  type        = bool
  default     = true
}

variable "kms_key_deletion_window" {
  description = "Waiting period before KMS key deletion (7-30 days, compliance requirement)"
  type        = number
  default     = 30

  validation {
    condition     = var.kms_key_deletion_window >= 7 && var.kms_key_deletion_window <= 30
    error_message = "KMS key deletion window must be between 7 and 30 days"
  }
}

# Network Security Configuration
variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the application (strict network access control)"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", cidr))])
    error_message = "Invalid CIDR block format"
  }
}

# Logging Configuration
variable "enable_cloudwatch_logs" {
  description = "Flag to enable/disable CloudWatch logging for security events (required for audit)"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "Number of days to retain security logs (compliance requirement)"
  type        = number
  default     = 365

  validation {
    condition     = contains([7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention must match CloudWatch allowed values and compliance requirements"
  }
}

# DDoS Protection Configuration
variable "enable_ddos_protection" {
  description = "Flag to enable/disable AWS Shield Advanced for DDoS protection"
  type        = bool
  default     = true
}

# Security Hub Configuration
variable "enable_security_hub" {
  description = "Flag to enable/disable AWS Security Hub for security monitoring"
  type        = bool
  default     = true
}