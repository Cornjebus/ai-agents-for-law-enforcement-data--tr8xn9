# Core Terraform functionality for variable definitions
terraform {
  required_version = "~> 1.0"
}

# Project name variable with validation
variable "project_name" {
  description = "Name of the project for resource naming"
  type        = string

  validation {
    condition     = length(var.project_name) > 0
    error_message = "Project name cannot be empty"
  }
}

# Environment variable with validation
variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be one of: development, staging, production"
  }
}

# Service-specific configurations for different components
variable "service_configs" {
  description = "Service-specific configurations for different components"
  type = map(object({
    cpu                      = number
    memory                   = number
    desired_count            = number
    max_capacity            = number
    min_capacity            = number
    health_check_grace_period = number
    deregistration_delay     = number
    scaling_cpu_threshold    = number
    scaling_memory_threshold = number
  }))

  default = {
    api = {
      cpu                      = 1024  # 1 vCPU
      memory                   = 2048  # 2GB
      desired_count            = 2
      max_capacity            = 10
      min_capacity            = 2
      health_check_grace_period = 60
      deregistration_delay     = 30
      scaling_cpu_threshold    = 70
      scaling_memory_threshold = 80
    }
    worker = {
      cpu                      = 2048  # 2 vCPU
      memory                   = 4096  # 4GB
      desired_count            = 1
      max_capacity            = 5
      min_capacity            = 1
      health_check_grace_period = 120
      deregistration_delay     = 60
      scaling_cpu_threshold    = 70
      scaling_memory_threshold = 80
    }
  }
}

# Deployment and circuit breaker configuration
variable "deployment_config" {
  description = "Deployment and circuit breaker configuration"
  type = object({
    enable_circuit_breaker = bool
    rollback_on_failure   = bool
    max_percent           = number
    min_healthy_percent   = number
    deployment_timeout    = number
  })

  default = {
    enable_circuit_breaker = true
    rollback_on_failure   = true
    max_percent           = 200
    min_healthy_percent   = 100
    deployment_timeout    = 300
  }
}

# Container monitoring and logging configuration
variable "monitoring_config" {
  description = "Container monitoring and logging configuration"
  type = object({
    enable_container_insights    = bool
    log_retention_days          = number
    metric_collection_interval  = number
    enable_execute_command      = bool
  })

  default = {
    enable_container_insights    = true
    log_retention_days          = 30
    metric_collection_interval  = 60
    enable_execute_command      = false
  }
}

# Container networking configuration
variable "networking_config" {
  description = "Container networking configuration"
  type = object({
    assign_public_ip            = bool
    service_discovery_enabled   = bool
    service_discovery_namespace = string
    load_balancer_enabled      = bool
  })

  default = {
    assign_public_ip            = false
    service_discovery_enabled   = true
    service_discovery_namespace = "local"
    load_balancer_enabled      = true
  }
}