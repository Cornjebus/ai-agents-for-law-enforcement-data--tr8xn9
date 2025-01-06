# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for database configuration
locals {
  db_name           = "revenue_platform"
  db_port           = "5432"
  db_engine         = "postgres"
  db_engine_version = "15.0"
  db_family         = "postgres15"

  common_tags = {
    Environment     = var.environment
    Project         = "autonomous-revenue-platform"
    ManagedBy       = "terraform"
    Service         = "database"
    DataTier        = "primary"
  }
}

# DB subnet group for RDS instances
resource "aws_db_subnet_group" "main" {
  name        = "rds-subnet-group-${var.environment}"
  description = "RDS subnet group for ${var.environment} environment"
  subnet_ids  = aws_subnet.private[*].id

  tags = merge(local.common_tags, {
    Name = "rds-subnet-group-${var.environment}"
  })
}

# Security group for RDS access
resource "aws_security_group" "rds" {
  name        = "rds-sg-${var.environment}"
  description = "Security group for RDS instances"
  vpc_id      = aws_vpc.vpc.id

  ingress {
    description     = "PostgreSQL access from private subnets"
    from_port       = local.db_port
    to_port         = local.db_port
    protocol        = "tcp"
    cidr_blocks     = [for subnet in aws_subnet.private : subnet.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "rds-sg-${var.environment}"
  })
}

# Parameter group for PostgreSQL configuration
resource "aws_db_parameter_group" "main" {
  name        = "rds-pg-${var.environment}"
  family      = local.db_family
  description = "Custom parameter group for ${var.environment} PostgreSQL instance"

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4096}"
  }

  parameter {
    name  = "work_mem"
    value = "16384"
  }

  parameter {
    name  = "maintenance_work_mem"
    value = "2097152"
  }

  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4096}"
  }

  parameter {
    name  = "ssl"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  tags = merge(local.common_tags, {
    Name = "rds-pg-${var.environment}"
  })
}

# Primary RDS instance
resource "aws_db_instance" "main" {
  identifier = "rds-${var.environment}"
  
  # Engine configuration
  engine                = local.db_engine
  engine_version        = local.db_engine_version
  instance_class        = var.db_instance_class
  
  # Storage configuration
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = aws_kms_key.rds_encryption_key.arn
  
  # Database configuration
  db_name                = local.db_name
  port                   = local.db_port
  username               = "admin"
  password               = random_password.db_password.result
  
  # Network configuration
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  
  # High availability configuration
  multi_az               = true
  availability_zone      = data.aws_availability_zones.available.names[0]
  
  # Backup configuration
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  # Performance configuration
  parameter_group_name    = aws_db_parameter_group.main.name
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  
  # Monitoring configuration
  monitoring_interval     = 60
  monitoring_role_arn    = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  
  # Security configuration
  deletion_protection     = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "final-snapshot-${local.db_name}-${var.environment}"
  copy_tags_to_snapshot  = true
  
  # Auto minor version upgrade
  auto_minor_version_upgrade = true
  
  tags = merge(local.common_tags, {
    Name = "rds-${var.environment}"
  })
}

# Random password generation for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# IAM role for RDS monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "rds-monitoring-role-${var.environment}"

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

  tags = local.common_tags
}

# Attach monitoring policy to IAM role
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Store database credentials in Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "db-credentials-${var.environment}"
  description = "Database credentials for ${var.environment} environment"
  kms_key_id  = aws_kms_key.secrets_encryption_key.arn

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    host     = aws_db_instance.main.endpoint
    port     = local.db_port
    dbname   = local.db_name
  })
}