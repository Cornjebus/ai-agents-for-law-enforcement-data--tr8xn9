# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws" # ~> 5.0
      version = "~> 5.0"
    }
  }
}

# Local variables for database configuration
locals {
  db_name                           = "revenue_platform"
  db_port                           = "5432"
  db_engine                         = "postgres"
  db_engine_version                 = "15.0"
  db_family                         = "postgres15"
  db_instance_class                 = "db.r6g.xlarge"
  db_allocated_storage              = "100"
  db_max_allocated_storage          = "1000"
  db_backup_retention_period        = "30"
  db_backup_window                  = "03:00-04:00"
  db_maintenance_window             = "Mon:04:00-Mon:05:00"
  db_deletion_protection            = "true"
  db_multi_az                       = "true"
  db_storage_encrypted              = "true"
  db_storage_type                   = "gp3"
  db_monitoring_interval            = "60"
  db_performance_insights_retention = "7"
  db_log_types                      = ["postgresql", "upgrade", "audit"]
}

# DB subnet group for multi-AZ deployment
resource "aws_db_subnet_group" "main" {
  name_prefix = "${var.project}-${var.environment}"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Environment         = var.environment
    Project            = var.project
    ManagedBy          = "terraform"
    DataClassification = var.compliance_tags["DataClassification"]
    ComplianceScope    = var.compliance_tags["ComplianceScope"]
  }
}

# DB parameter group with optimized settings
resource "aws_db_parameter_group" "main" {
  family      = local.db_family
  name_prefix = "${var.project}-${var.environment}"

  parameter {
    name         = "shared_buffers"
    value        = "{DBInstanceClassMemory/4}"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "max_connections"
    value        = "1000"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "work_mem"
    value        = "64MB"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "maintenance_work_mem"
    value        = "256MB"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "effective_cache_size"
    value        = "{DBInstanceClassMemory/2}"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "checkpoint_timeout"
    value        = "900"
    apply_method = "pending-reboot"
  }

  parameter {
    name         = "log_min_duration_statement"
    value        = "1000"
    apply_method = "immediate"
  }

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
}

# Security group for RDS instance
resource "aws_security_group" "rds" {
  name_prefix = "${var.project}-${var.environment}-rds"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    security_groups = []  # Will be populated by application security groups
  }

  tags = {
    Environment         = var.environment
    Project            = var.project
    ManagedBy          = "terraform"
    DataClassification = var.compliance_tags["DataClassification"]
    SecurityZone       = var.compliance_tags["SecurityZone"]
  }
}

# RDS instance with comprehensive security and monitoring
resource "aws_db_instance" "main" {
  identifier_prefix = "${var.project}-${var.environment}"
  engine            = local.db_engine
  engine_version    = local.db_engine_version
  instance_class    = local.db_instance_class

  allocated_storage     = local.db_allocated_storage
  max_allocated_storage = local.db_max_allocated_storage
  storage_type          = local.db_storage_type
  storage_encrypted     = local.db_storage_encrypted
  kms_key_id           = var.kms_key_id

  db_name  = local.db_name
  port     = local.db_port
  multi_az = local.db_multi_az

  db_subnet_group_name   = aws_db_subnet_group.main.name
  parameter_group_name   = aws_db_parameter_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = local.db_backup_retention_period
  backup_window          = local.db_backup_window
  maintenance_window     = local.db_maintenance_window
  deletion_protection    = local.db_deletion_protection

  monitoring_interval = local.db_monitoring_interval
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled          = true
  performance_insights_retention_period = local.db_performance_insights_retention
  performance_insights_kms_key_id       = var.kms_key_id

  enabled_cloudwatch_logs_exports = local.db_log_types

  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "${var.project}-${var.environment}-final"

  tags = {
    Environment         = var.environment
    Project            = var.project
    ManagedBy          = "terraform"
    DataClassification = var.compliance_tags["DataClassification"]
    ComplianceScope    = var.compliance_tags["ComplianceScope"]
    SecurityZone       = var.compliance_tags["SecurityZone"]
    BackupRetention    = local.db_backup_retention_period
    EncryptionType     = "AES-256-GCM"
  }
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  name_prefix = "${var.project}-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

# Attach enhanced monitoring policy
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Outputs
output "db_instance_endpoint" {
  description = "RDS instance endpoint for application connection"
  value       = aws_db_instance.main.endpoint
}

output "db_instance_id" {
  description = "RDS instance identifier for reference and monitoring"
  value       = aws_db_instance.main.id
}

output "db_security_group_id" {
  description = "Security group ID for database access control"
  value       = aws_security_group.rds.id
}

output "db_parameter_group_id" {
  description = "Parameter group ID for configuration management"
  value       = aws_db_parameter_group.main.id
}