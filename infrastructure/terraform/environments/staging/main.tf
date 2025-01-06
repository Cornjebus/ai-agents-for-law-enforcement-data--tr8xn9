# Terraform configuration with enhanced security and compliance features
terraform {
  required_version = ">= 1.5.0"
  
  # Remote state configuration with encryption
  backend "s3" {
    bucket         = "revenue-platform-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-west-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:us-west-1:123456789012:key/terraform-state"
  }
}

# Local variables for environment configuration
locals {
  environment = "staging"
  aws_region = "us-west-1"
  project_name = "revenue-platform"
  
  # Enhanced compliance tags
  compliance_tags = {
    DataClassification  = "Confidential"
    ComplianceFramework = "CCPA-GDPR"
    SecurityLevel       = "High"
  }
}

# AWS provider configuration with default tags
provider "aws" {
  region = local.aws_region
  
  default_tags {
    tags = {
      Environment         = local.environment
      Project            = local.project_name
      ManagedBy          = "terraform"
      DataClassification = local.compliance_tags.DataClassification
      ComplianceFramework = local.compliance_tags.ComplianceFramework
      SecurityLevel      = local.compliance_tags.SecurityLevel
    }
  }
}

# API Gateway module with enhanced security features
module "api_gateway" {
  source = "../../modules/api-gateway"
  
  environment = local.environment
  project_name = local.project_name
  
  # Enhanced caching configuration
  enable_caching = true
  cache_settings = {
    size = "0.5"
    ttl = 300
    encryption_enabled = true
    require_authorization = true
    data_encrypted = true
    per_key_invalidation_enabled = true
  }
  
  # DDoS protection and rate limiting
  rate_limit_settings = {
    burst_limit = 1000
    rate_limit = 500
    per_client_limit = 100
    throttle_settings = {
      retry_after = 60
      throttle_period = 300
    }
  }
  
  # Security configuration
  security_settings = {
    waf_enabled = true
    ssl_policy = "TLS-1-2-2021"
    mutual_tls_auth = false
  }
}

# Container infrastructure with optimized resource allocation
module "container" {
  source = "../../modules/container"
  
  environment = local.environment
  project_name = local.project_name
  
  # Container resource configuration
  container_cpu = {
    api = 1024
    worker = 2048
  }
  
  container_memory = {
    api = 2048
    worker = 4096
  }
  
  # Auto-scaling configuration
  auto_scaling_settings = {
    min_capacity = 2
    max_capacity = 10
    target_cpu_utilization = 70
    target_memory_utilization = 80
  }
  
  # Enhanced security settings
  security_settings = {
    enable_container_insights = true
    enable_execute_command = false
    secrets_encryption_key = "arn:aws:kms:us-west-1:123456789012:key/container-secrets"
  }
}

# Enhanced monitoring configuration
module "monitoring" {
  source = "../../modules/monitoring"
  
  environment = local.environment
  project_name = local.project_name
  
  # Performance monitoring thresholds
  performance_thresholds = {
    api_latency_ms = 100
    voice_rtt_ms = 200
    content_gen_timeout_sec = 2
    db_query_ms = 10
  }
  
  # Observability stack configuration
  observability_stack = {
    prometheus_enabled = true
    grafana_enabled = true
    elk_enabled = true
    xray_enabled = true
  }
  
  # Log retention configuration
  retention_config = {
    cloudwatch_days = 30
    prometheus_days = 15
    elk_days = 30
  }
}

# Output configurations
output "api_gateway_endpoint" {
  description = "API Gateway endpoint URL for staging environment"
  value = module.api_gateway.api_gateway_endpoint
  sensitive = true
}

output "container_services" {
  description = "Container service information for monitoring and management"
  value = {
    api_service = module.container.api_service_name
    worker_service = module.container.worker_service_name
    auto_scaling_status = module.container.auto_scaling_group_name
  }
  sensitive = true
}