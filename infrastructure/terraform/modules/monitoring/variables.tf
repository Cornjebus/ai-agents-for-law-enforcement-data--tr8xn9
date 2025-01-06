# Core Terraform functionality for variable definitions
terraform {
  required_version = ">=1.5.0"
}

# Project name variable for resource naming and tagging
variable "project_name" {
  description = "Name of the project for resource naming and tagging"
  type        = string

  validation {
    condition     = length(var.project_name) > 0
    error_message = "Project name cannot be empty"
  }
}

# Environment variable for deployment context
variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production"
  }
}

# Additional resource tags
variable "tags" {
  description = "Additional tags to apply to monitoring resources"
  type        = map(string)
  default     = {}
}

# Observability stack configuration
variable "observability_stack" {
  description = "Configuration for observability stack components"
  type = object({
    prometheus_enabled = bool
    grafana_enabled   = bool
    elk_enabled       = bool
    xray_enabled      = bool
  })
  default = {
    prometheus_enabled = true
    grafana_enabled   = true
    elk_enabled       = true
    xray_enabled      = true
  }
}

# Retention configuration for monitoring components
variable "retention_config" {
  description = "Retention configuration for different monitoring components"
  type = object({
    cloudwatch_days = number
    prometheus_days = number
    elk_days       = number
  })
  default = {
    cloudwatch_days = 30
    prometheus_days = 15
    elk_days       = 30
  }

  validation {
    condition     = all([for v in values(var.retention_config) : v > 0])
    error_message = "All retention periods must be greater than 0"
  }
}

# Performance monitoring thresholds
variable "performance_thresholds" {
  description = "Performance monitoring thresholds"
  type = object({
    api_latency_ms         = number
    voice_rtt_ms          = number
    content_gen_timeout_sec = number
    db_query_ms           = number
  })
  default = {
    api_latency_ms         = 100
    voice_rtt_ms          = 200
    content_gen_timeout_sec = 2
    db_query_ms           = 10
  }

  validation {
    condition     = all([for v in values(var.performance_thresholds) : v > 0])
    error_message = "All performance thresholds must be greater than 0"
  }
}

# CloudWatch metric alarms configuration
variable "metric_alarms" {
  description = "Configuration for CloudWatch metric alarms"
  type = map(object({
    metric_name         = string
    namespace          = string
    comparison_operator = string
    threshold          = number
    evaluation_periods = number
    period             = number
    statistic          = string
    alarm_description  = string
    alarm_actions      = list(string)
  }))
  default = {}
}

# Datadog integration configuration
variable "datadog_config" {
  description = "Datadog integration configuration"
  type = object({
    enabled                    = bool
    api_key                    = string
    app_key                    = string
    metrics_collection_interval = number
  })
  sensitive = true

  validation {
    condition     = !var.datadog_config.enabled || (length(var.datadog_config.api_key) > 0 && length(var.datadog_config.app_key) > 0)
    error_message = "API key and App key are required when Datadog integration is enabled"
  }
}

# CloudWatch log groups configuration
variable "log_groups" {
  description = "Configuration for CloudWatch log groups"
  type = map(object({
    retention_days = number
    kms_key_id    = string
  }))
  default = {}
}