# AWS Region Configuration
aws_region = "us-west-1"  # California region for initial market focus

# Environment Identification
environment  = "staging"
project_name = "revenue-platform"

# Network Configuration
vpc_cidr = "10.1.0.0/16"  # Dedicated CIDR range for staging
availability_zones = [
  "us-west-1a",
  "us-west-1b"
]

# Domain Configuration
domain_name = "staging.revenue-platform.com"

# Container Resource Allocation (in millicores/MB)
container_cpu = {
  api    = 1024  # 1 vCPU
  web    = 512   # 0.5 vCPU
  worker = 2048  # 2 vCPU
}

container_memory = {
  api    = 2048  # 2GB
  web    = 1024  # 1GB
  worker = 4096  # 4GB
}

# Auto Scaling Configuration
auto_scaling_config = {
  min_capacity             = 2
  max_capacity             = 4
  target_cpu_utilization    = 70
  target_memory_utilization = 80
}

# Database Configuration
database_config = {
  instance_class      = "db.t3.large"
  allocated_storage   = 100
  engine_version     = "13.7"
  backup_retention    = 7
  maintenance_window = "Mon:03:00-Mon:04:00"
  multi_az          = true
  deletion_protection = true
}

# Monitoring Configuration
monitoring_config = {
  metrics_resolution      = 60    # 1-minute resolution
  log_retention_days     = 30    # 30 days retention
  alarm_evaluation_periods = 3     # Number of periods before alarm
  enable_detailed_monitoring = true
  dashboard_refresh_interval = 300  # 5-minute refresh
}

# Security Configuration
security_config = {
  allowed_ip_ranges   = ["10.0.0.0/8"]  # Internal network access
  enable_waf         = true
  enable_guardduty   = true
  enable_cloudtrail  = true
  ssl_certificate_arn = "arn:aws:acm:us-west-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"
}

# Backup Configuration
backup_config = {
  enable_automated_backups   = true
  backup_retention_period   = 7
  backup_window            = "02:00-03:00"
  enable_cross_region_backup = false  # Not needed for staging
  cross_region_destination  = null
}

# Resource Tags
tags = {
  Environment = "staging"
  Project     = "Autonomous Revenue Generation Platform"
  ManagedBy   = "Terraform"
  CostCenter  = "Engineering"
  Team        = "Platform"
}

# Load Balancer Configuration
load_balancer_config = {
  idle_timeout = 60
  enable_http2 = true
  enable_deletion_protection = true
}

# Cache Configuration
elasticache_config = {
  node_type       = "cache.t3.medium"
  num_cache_nodes = 2
  engine_version  = "6.x"
}

# Service Mesh Configuration
service_mesh_config = {
  enable_mesh = true
  protocol_version = "grpc"
  timeout_seconds = 30
}

# Logging Configuration
logging_config = {
  retention_in_days = 30
  enable_api_logging = true
  enable_container_insights = true
}