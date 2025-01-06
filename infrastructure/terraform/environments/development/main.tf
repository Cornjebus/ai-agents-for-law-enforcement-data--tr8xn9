# Development environment Terraform configuration for Autonomous Revenue Generation Platform
# Version: 1.0.0
# Provider version: ~> 5.0

terraform {
  required_version = ">= 1.5.0"
  
  # S3 backend configuration for development environment
  backend "s3" {
    bucket         = "revenue-platform-terraform-state-dev"
    key            = "development/terraform.tfstate"
    region         = "us-west-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock-dev"
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Local variables for development environment
locals {
  environment = "development"
  aws_region = "us-west-1"
  project_name = "revenue-platform"
  debug_mode = true
  enable_container_insights = true
  enable_x_ray = true
  log_level = "DEBUG"

  # Development-specific tags
  common_tags = {
    Environment = local.environment
    Project = local.project_name
    ManagedBy = "terraform"
    Debug = tostring(local.debug_mode)
    CostCenter = "development"
  }

  # Development availability zones
  availability_zones = ["us-west-1a", "us-west-1b"]
}

# AWS Provider configuration
provider "aws" {
  region = local.aws_region
  
  default_tags {
    tags = local.common_tags
  }
}

# API Gateway module with development configuration
module "api_gateway" {
  source = "../../modules/api-gateway"
  
  environment = local.environment
  enable_caching = false # Disabled for development
  
  rate_limit_settings = {
    burst_limit = 1000
    rate_limit = 500
  }
  
  log_retention_days = 7 # Shorter retention for development
  enable_debug_logging = true
  
  cors_settings = {
    allow_origins = ["*"] # Permissive CORS for development
    allow_methods = ["*"]
    allow_headers = ["*"]
  }

  monitoring_settings = {
    detailed_metrics_enabled = true
    logging_level = "DEBUG"
    sampling_rate = 100
    trace_enabled = true
  }
}

# Container module with development configuration
module "container" {
  source = "../../modules/container"
  
  environment = local.environment
  project_name = local.project_name
  
  # Development-appropriate container resources
  container_cpu = {
    api = 1024    # 1 vCPU for development
    worker = 2048 # 2 vCPU for development
  }
  
  container_memory = {
    api = 2048    # 2GB for development
    worker = 4096 # 4GB for development
  }
  
  desired_count = {
    api = 2
    worker = 1
  }
  
  # Enhanced debugging capabilities
  enable_container_insights = true
  enable_execute_command = true
  enable_x_ray = true
  log_level = "DEBUG"
  
  # Development auto-scaling settings
  auto_scaling_settings = {
    max_capacity = 4
    min_capacity = 1
    target_cpu_utilization = 70
  }

  # Container health check settings
  health_check_settings = {
    interval = 30
    timeout = 5
    retries = 3
    start_period = 60
  }
}

# Security module with development configuration
module "security" {
  source = "../../modules/security"
  
  environment = local.environment
  vpc_id = module.networking.vpc_id
  
  # Development security settings
  enable_waf = true
  waf_rate_limit = 2000
  
  # Development KMS configuration
  enable_kms_encryption = true
  kms_key_deletion_window = 7
  
  # Development logging
  enable_cloudwatch_logs = true
  log_retention_days = 7
  
  # Development network access
  allowed_cidr_blocks = ["0.0.0.0/0"] # Open access for development
}

# Networking module with development configuration
module "networking" {
  source = "../../modules/networking"
  
  vpc_cidr = "10.0.0.0/16"
  availability_zones = local.availability_zones
  
  # Development subnet configuration
  public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.3.0/24", "10.0.4.0/24"]
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  
  # Development flow logs
  enable_flow_logs = true
  flow_logs_retention_days = 7
}

# Outputs for development environment
output "api_gateway_endpoint" {
  description = "Development API Gateway endpoint URL"
  value = module.api_gateway.api_gateway_endpoint
}

output "container_services" {
  description = "Container service information including debug status"
  value = {
    api_service = module.container.api_service_name
    worker_service = module.container.worker_service_name
    debug_enabled = local.debug_mode
  }
}

output "vpc_info" {
  description = "VPC information for development environment"
  value = {
    vpc_id = module.networking.vpc_id
    public_subnets = module.networking.public_subnet_ids
    private_subnets = module.networking.private_subnet_ids
  }
}