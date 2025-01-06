# AWS Region Configuration
aws_region = "us-west-1"
environment = "development"
project_name = "revenue-platform"

# Network Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = [
  "us-west-1a",
  "us-west-1b"
]
domain_name = "dev.revenue-platform.com"

# Container Resource Configuration
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

container_desired_count = {
  api    = 2
  web    = 2
  worker = 1
}

# Feature Flags
enable_caching = false
debug_mode = true
enable_monitoring = true
enable_performance_insights = true
enable_enhanced_monitoring = false

# Monitoring and Logging
log_retention_days = 7
monitoring_interval = 60
performance_insights_retention = 7

# API Gateway Settings
rate_limit_settings = {
  burst_limit = 1000
  rate_limit  = 500
}

# Database Configuration
rds_instance_class = "db.t3.medium"
backup_retention_days = 7
backup_window = "03:00-04:00"
maintenance_window = "Mon:04:00-Mon:05:00"
deletion_protection = false
skip_final_snapshot = true
max_instance_lifetime = 7

# Cache Configuration
elasticache_node_type = "cache.t3.micro"
elasticache_num_cache_nodes = 1

# Development Environment Schedule
auto_shutdown_schedule = "cron(0 20 ? * MON-FRI *)"  # 8 PM PST
auto_startup_schedule = "cron(0 8 ? * MON-FRI *)"    # 8 AM PST