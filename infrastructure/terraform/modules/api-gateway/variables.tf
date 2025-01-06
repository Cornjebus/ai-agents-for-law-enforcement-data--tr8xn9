# Terraform variables definition file for Kong-based API Gateway module
# Version: ~> 1.5

# Core environment configuration
variable "environment" {
  description = "Environment name for resource naming and tagging (e.g., development, staging, production)"
  type        = string
  validation {
    condition     = can(regex("^(development|staging|production)$", var.environment))
    error_message = "Environment must be one of: development, staging, production"
  }
}

variable "project_name" {
  description = "Name of the project for resource naming and tagging"
  type        = string
  default     = "autonomous-revenue-platform"
}

# Network configuration
variable "vpc_id" {
  description = "ID of the VPC where the API Gateway VPC Link will be created"
  type        = string
}

variable "nlb_arn" {
  description = "ARN of the Network Load Balancer for VPC Link integration"
  type        = string
}

variable "endpoint_type" {
  description = "API Gateway endpoint type (EDGE, REGIONAL, or PRIVATE)"
  type        = string
  default     = "REGIONAL"
  validation {
    condition     = can(regex("^(EDGE|REGIONAL|PRIVATE)$", var.endpoint_type))
    error_message = "Endpoint type must be one of: EDGE, REGIONAL, PRIVATE"
  }
}

# Cache configuration
variable "enable_caching" {
  description = "Enable API Gateway caching for improved performance"
  type        = bool
  default     = true
}

variable "cache_settings" {
  description = "Comprehensive API Gateway cache settings for performance optimization"
  type = object({
    size                         = string
    ttl                         = string
    encryption_enabled          = bool
    require_authorization       = bool
    data_encrypted             = bool
    per_key_invalidation_enabled = bool
  })
  default = {
    size                         = "0.5"
    ttl                         = "300"
    encryption_enabled          = true
    require_authorization       = true
    data_encrypted             = true
    per_key_invalidation_enabled = true
  }
}

# Security configuration
variable "rate_limit_settings" {
  description = "API Gateway rate limiting configuration for DDoS protection"
  type = object({
    burst_limit     = number
    rate_limit      = number
    per_client_limit = number
    throttle_settings = object({
      retry_after     = number
      throttle_period = number
    })
  })
  default = {
    burst_limit     = 1000
    rate_limit      = 2000
    per_client_limit = 100
    throttle_settings = {
      retry_after     = 300
      throttle_period = 60
    }
  }
}

variable "waf_settings" {
  description = "Web Application Firewall settings for API Gateway"
  type = object({
    enabled        = bool
    rule_sets      = list(string)
    ip_rate_limit  = number
    block_period   = number
  })
  default = {
    enabled        = true
    rule_sets      = ["AWS-AWSManagedRulesCommonRuleSet"]
    ip_rate_limit  = 2000
    block_period   = 300
  }
}

# Monitoring configuration
variable "monitoring_settings" {
  description = "API Gateway monitoring and logging configuration"
  type = object({
    detailed_metrics_enabled = bool
    logging_level           = string
    sampling_rate          = number
    trace_enabled          = bool
  })
  default = {
    detailed_metrics_enabled = true
    logging_level           = "INFO"
    sampling_rate          = 100
    trace_enabled          = true
  }
  validation {
    condition     = contains(["ERROR", "INFO", "DEBUG"], var.monitoring_settings.logging_level)
    error_message = "Logging level must be one of: ERROR, INFO, DEBUG"
  }
}

variable "log_retention_days" {
  description = "Number of days to retain API Gateway logs for security and compliance"
  type        = number
  default     = 30
  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.log_retention_days)
    error_message = "Log retention days must be one of the allowed CloudWatch values"
  }
}

# Resource tagging
variable "tags" {
  description = "Resource tags for API Gateway resources and cost allocation"
  type        = map(string)
  default     = {}
}