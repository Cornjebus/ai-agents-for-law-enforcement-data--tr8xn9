# Configure Terraform version and required providers
terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Configure S3 backend with encryption and state locking
  backend "s3" {
    bucket         = "revenue-platform-tfstate-prod"
    key            = "production/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-lock-prod"
    kms_key_id     = "alias/terraform-state-key"
  }
}

# Local variables for environment configuration
locals {
  environment = "production"
  aws_region = "us-west-2"
  secondary_region = "us-east-1"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  backup_retention_days = 30
  log_retention_days = 30
  
  common_tags = {
    Environment = local.environment
    Project = "revenue-platform"
    ManagedBy = "terraform"
    SecurityLevel = "high"
    ComplianceRequired = "true"
  }
}

# Primary region provider configuration
provider "aws" {
  region = local.aws_region
  alias  = "primary"
  
  default_tags {
    tags = local.common_tags
  }
}

# Secondary region provider for disaster recovery
provider "aws" {
  region = local.secondary_region
  alias  = "secondary"
  
  default_tags {
    tags = local.common_tags
  }
}

# Core AWS infrastructure module
module "aws" {
  source = "../../aws"
  
  environment = local.environment
  aws_region = local.aws_region
  enable_multi_region = true
  secondary_region = local.secondary_region
  availability_zones = local.availability_zones
  
  # Enhanced security features
  enable_enhanced_monitoring = true
  enable_waf = true
  enable_shield = true
  backup_retention_days = local.backup_retention_days
  
  vpc_cidr = "10.0.0.0/16"
  public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnet_cidrs = ["10.0.4.0/24", "10.0.5.0/24", "10.0.6.0/24"]
  enable_nat_gateway = true
  enable_vpn_gateway = false
}

# API Gateway module with enhanced security
module "api_gateway" {
  source = "../../modules/api-gateway"
  
  environment = local.environment
  vpc_id = module.aws.vpc_id
  
  # Enable caching for performance
  enable_caching = true
  cache_settings = {
    size = "0.5"
    ttl = 300
    encryption_enabled = true
    require_authorization = true
    data_encrypted = true
    per_key_invalidation_enabled = true
  }
  
  # Rate limiting for DDoS protection
  rate_limit_settings = {
    burst_limit = 1000
    rate_limit = 10000
    per_client_limit = 100
    throttle_settings = {
      retry_after = 300
      throttle_period = 60
    }
  }
  
  endpoint_type = "REGIONAL"
  log_retention_days = local.log_retention_days
  waf_enabled = true
  ssl_enabled = true
  mutual_tls_auth = true
}

# Container infrastructure module
module "container" {
  source = "../../modules/container"
  
  project_name = "revenue-platform"
  environment = local.environment
  
  # Container resource allocation
  container_cpu = {
    api = 1024
    worker = 2048
  }
  container_memory = {
    api = 2048
    worker = 4096
  }
  
  cluster_id = module.aws.ecs_cluster_id
  vpc_config = {
    vpc_id = module.aws.vpc_id
    private_subnets = module.aws.private_subnet_ids
  }
  
  # Enhanced container security
  enable_auto_scaling = true
  enable_container_insights = true
  enable_execute_command = false
  secrets_encryption_key = module.aws.kms_key_arn
}

# Outputs for cross-module reference
output "vpc_id" {
  value = module.aws.vpc_id
  description = "Production VPC ID"
}

output "api_gateway_endpoint" {
  value = module.api_gateway.api_gateway_endpoint
  description = "Production API Gateway endpoint"
}

output "ecs_cluster_name" {
  value = module.container.ecs_cluster_name
  description = "Production ECS cluster name"
}