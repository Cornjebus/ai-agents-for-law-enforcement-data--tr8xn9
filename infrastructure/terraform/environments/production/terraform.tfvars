# AWS Region Configuration
aws_region = "us-west-1"

# Environment Identifier
environment = "production"
project_name = "revenue-platform"

# Network Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["us-west-1a", "us-west-1b"]

# Container Resources Configuration
container_resources = {
  api = {
    cpu = 1024                    # 1 vCPU
    memory = 2048                 # 2GB RAM
    min_instances = 2
    max_instances = 10
    target_cpu_utilization = 70
    target_memory_utilization = 80
  }
  web = {
    cpu = 512                     # 0.5 vCPU
    memory = 1024                 # 1GB RAM
    min_instances = 2
    max_instances = 8
    target_cpu_utilization = 60
    target_memory_utilization = 75
  }
  worker = {
    cpu = 2048                    # 2 vCPU
    memory = 4096                 # 4GB RAM
    min_instances = 1
    max_instances = 5
    target_cpu_utilization = 80
    target_memory_utilization = 85
  }
}

# Database Configuration
database_config = {
  instance_class = "db.r6g.xlarge"
  allocated_storage = 100
  max_allocated_storage = 1000
  multi_az = true
  backup_retention_period = 30
  deletion_protection = true
  maintenance_window = "Mon:03:00-Mon:04:00"
  engine_version = "13.7"
}

# Monitoring Configuration
monitoring_config = {
  log_retention_days = 30
  metric_resolution = 60
  alarm_evaluation_periods = 3
  alarm_period = 60
  enable_detailed_monitoring = true
  dashboard_refresh_interval = 300
}

# Network Configuration
network_config = {
  vpc_cidr = "10.0.0.0/16"
  public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.11.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = false
}

# Security Configuration
security_config = {
  allowed_ip_ranges = ["0.0.0.0/0"]  # Restrict in production
  ssl_certificate_arn = "arn:aws:acm:us-west-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"
  enable_waf = true
  enable_guardduty = true
  enable_cloudtrail = true
}

# Backup Configuration
backup_config = {
  enable_automated_backups = true
  backup_retention_period = 30
  backup_window = "03:00-04:00"
  enable_cross_region_backup = true
  cross_region_destination = "us-east-1"
}

# Domain Configuration
domain_name = "revenue-platform.com"

# Resource Tags
tags = {
  Environment = "production"
  Project     = "Autonomous Revenue Generation Platform"
  ManagedBy   = "Terraform"
  Owner       = "Platform Team"
  CostCenter  = "PROD-001"
}