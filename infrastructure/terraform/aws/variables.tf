# terraform version constraint
terraform {
  required_version = ">=1.5.0"
}

# Primary AWS region variable
variable "aws_region" {
  type        = string
  description = "Primary AWS region for infrastructure deployment with failover support"
  default     = "us-west-1"
}

# Environment variable with validation
variable "environment" {
  type        = string
  description = "Deployment environment (production, staging, development)"
  
  validation {
    condition     = can(regex("^(production|staging|development)$", var.environment))
    error_message = "Environment must be one of: production, staging, development"
  }
}

# Container resources configuration
variable "container_resources" {
  type = map(object({
    cpu              = number
    memory           = number
    min_instances    = number
    max_instances    = number
    cpu_threshold    = number
    memory_threshold = optional(number)
    request_threshold = optional(number)
    queue_threshold  = optional(number)
  }))
  
  description = "Container resource configurations for different service types"
  
  default = {
    api = {
      cpu              = 1024
      memory           = 2048
      min_instances    = 2
      max_instances    = 10
      cpu_threshold    = 70
      memory_threshold = 80
    }
    frontend = {
      cpu              = 512
      memory           = 1024
      min_instances    = 2
      max_instances    = 8
      cpu_threshold    = 60
      request_threshold = 1000
    }
    worker = {
      cpu              = 2048
      memory           = 4096
      min_instances    = 1
      max_instances    = 5
      queue_threshold  = 100
    }
  }

  validation {
    condition     = alltrue([for k, v in var.container_resources : v.cpu >= 256 && v.memory >= 512])
    error_message = "Container resources must meet minimum requirements: CPU >= 256, Memory >= 512"
  }
}

# Database configuration
variable "database_config" {
  type = object({
    instance_class    = string
    allocated_storage = number
    engine_version    = string
    backup_retention  = number
    maintenance_window = string
    multi_az         = bool
    deletion_protection = bool
  })
  
  description = "RDS database configuration including instance size and operational parameters"
  
  validation {
    condition     = can(regex("^(db\\.t3|db\\.r5|db\\.r6).*", var.database_config.instance_class))
    error_message = "Invalid RDS instance class specified. Must be db.t3, db.r5, or db.r6 series"
  }
}

# Monitoring configuration
variable "monitoring_config" {
  type = object({
    log_retention_days       = number
    metric_resolution       = number
    alarm_evaluation_periods = number
    alarm_period            = number
    enable_detailed_monitoring = bool
    dashboard_refresh_interval = number
  })
  
  description = "CloudWatch monitoring configuration for metrics, logs, and alerts"
  
  default = {
    log_retention_days       = 30
    metric_resolution       = 60
    alarm_evaluation_periods = 3
    alarm_period            = 300
    enable_detailed_monitoring = true
    dashboard_refresh_interval = 300
  }
}

# Network configuration
variable "network_config" {
  type = object({
    vpc_cidr            = string
    public_subnet_cidrs = list(string)
    private_subnet_cidrs = list(string)
    enable_nat_gateway  = bool
    single_nat_gateway  = bool
  })
  
  description = "VPC and networking configuration including subnets and NAT gateways"
}

# Security configuration
variable "security_config" {
  type = object({
    allowed_ip_ranges   = list(string)
    ssl_certificate_arn = string
    enable_waf         = bool
    enable_guardduty   = bool
    enable_cloudtrail  = bool
  })
  
  description = "Security-related configuration including firewall rules and monitoring"
}

# Backup configuration
variable "backup_config" {
  type = object({
    enable_automated_backups = bool
    backup_retention_period = number
    backup_window          = string
    enable_cross_region_backup = bool
    cross_region_destination  = string
  })
  
  description = "Backup configuration for databases and critical data"
}

# Tags configuration
variable "tags" {
  type = map(string)
  description = "Common tags to be applied to all resources"
  
  default = {
    Project     = "Autonomous Revenue Generation Platform"
    ManagedBy   = "Terraform"
    Environment = "production"
  }
}