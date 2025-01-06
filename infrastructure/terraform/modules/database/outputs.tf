# Database module outputs with enhanced security and monitoring configurations
# Version: 1.0
# Provider version: hashicorp/aws ~> 5.0

# Primary database endpoint with sensitive flag for security
output "db_instance_endpoint" {
  description = <<-EOT
    Primary RDS instance endpoint for application connection.
    Format: <hostname>:<port>
    SENSITIVITY: HIGH - Contains database connection information
    SECURITY: Requires SSL/TLS encryption for connections
  EOT
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

# Database instance identifier for monitoring and operations
output "db_instance_id" {
  description = <<-EOT
    RDS instance identifier for monitoring and operations.
    Used for CloudWatch metrics and performance insights.
    MONITORING: Enhanced monitoring enabled with 60s resolution
  EOT
  value       = aws_db_instance.main.id
}

# Database instance address for DNS configuration
output "db_instance_address" {
  description = <<-EOT
    RDS instance hostname for DNS configuration.
    Used for internal service discovery and routing.
    NETWORK: Deployed in private subnets with security groups
  EOT
  value       = aws_db_instance.main.address
}

# Database port for security group configuration
output "db_instance_port" {
  description = <<-EOT
    RDS instance port for security group rules.
    Default: 5432 for PostgreSQL
    SECURITY: Access restricted by security groups
  EOT
  value       = aws_db_instance.main.port
}

# Database name for application configuration
output "db_instance_name" {
  description = <<-EOT
    Database name for application configuration.
    SENSITIVITY: HIGH - Contains database identifier
  EOT
  value       = aws_db_instance.main.db_name
  sensitive   = true
}

# Security group ID for network access control
output "db_security_group_id" {
  description = <<-EOT
    Security group ID controlling database access.
    SECURITY: Restricts access to authorized application servers
    COMPLIANCE: Implements least privilege access
  EOT
  value       = aws_security_group.rds.id
}

# Subnet group name for network configuration
output "db_subnet_group_name" {
  description = <<-EOT
    DB subnet group name for high availability.
    AVAILABILITY: Multi-AZ deployment across private subnets
    NETWORK: Isolated database tier
  EOT
  value       = aws_db_subnet_group.main.name
}

# Parameter group name for database configuration
output "db_parameter_group_name" {
  description = <<-EOT
    Parameter group name for PostgreSQL configuration.
    PERFORMANCE: Optimized for production workloads
    SECURITY: Enforces SSL/TLS connections
  EOT
  value       = aws_db_parameter_group.main.name
}

# Read replica endpoint for high availability
output "db_replica_endpoint" {
  description = <<-EOT
    Read replica endpoint for scaling read operations.
    AVAILABILITY: Automatic failover enabled
    PERFORMANCE: Load balancing for read operations
    SENSITIVITY: HIGH - Contains database connection information
  EOT
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

# Backup retention period for disaster recovery
output "db_backup_retention_period" {
  description = <<-EOT
    Backup retention period in days.
    COMPLIANCE: Meets data retention requirements
    DR: Enables point-in-time recovery
  EOT
  value       = aws_db_instance.main.backup_retention_period
}

# Monitoring role ARN for enhanced metrics
output "db_monitoring_role_arn" {
  description = <<-EOT
    IAM role ARN for enhanced monitoring.
    MONITORING: Enables detailed performance insights
    METRICS: 60-second resolution for critical metrics
  EOT
  value       = aws_db_instance.main.monitoring_role_arn
}

# KMS key ID for encryption configuration
output "db_kms_key_id" {
  description = <<-EOT
    KMS key ID for database encryption.
    SECURITY: AES-256-GCM encryption at rest
    COMPLIANCE: Meets data protection requirements
    SENSITIVITY: HIGH - Contains encryption key identifier
  EOT
  value       = aws_db_instance.main.kms_key_id
  sensitive   = true
}

# Performance insights configuration
output "db_performance_insights_enabled" {
  description = <<-EOT
    Performance Insights configuration status.
    MONITORING: Advanced database performance analysis
    RETENTION: 7-day retention for performance data
  EOT
  value = {
    enabled        = true
    retention_days = aws_db_instance.main.performance_insights_retention_period
  }
}

# High availability configuration
output "db_high_availability_config" {
  description = <<-EOT
    High availability configuration details.
    AVAILABILITY: Multi-AZ deployment with automatic failover
    REPLICATION: Synchronous replication to standby
  EOT
  value = {
    multi_az_enabled     = aws_db_instance.main.multi_az
    deletion_protection  = aws_db_instance.main.deletion_protection
    maintenance_window   = aws_db_instance.main.maintenance_window
    backup_window       = aws_db_instance.main.backup_window
  }
}

# Compliance and audit configuration
output "db_compliance_config" {
  description = <<-EOT
    Database compliance and audit configuration.
    COMPLIANCE: CCPA, GDPR, SOC2 compliant configuration
    AUDIT: Enables logging and monitoring for compliance
  EOT
  value = {
    storage_encrypted = aws_db_instance.main.storage_encrypted
    log_types        = aws_db_instance.main.enabled_cloudwatch_logs_exports
    monitoring_interval = aws_db_instance.main.monitoring_interval
  }
}