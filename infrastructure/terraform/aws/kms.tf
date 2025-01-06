# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common tags and naming
locals {
  common_tags = {
    Environment         = var.environment
    Project            = "autonomous-revenue-platform"
    ManagedBy          = "terraform"
    SecurityCompliance = "CCPA-GDPR-SOC2-PCI"
    DataClassification = "Sensitive"
    BackupRequired     = "true"
    KeyRotationRequired = "true"
  }

  key_prefix = "arp-${var.environment}"
}

# RDS encryption key
resource "aws_kms_key" "rds_encryption_key" {
  description             = "KMS key for RDS database encryption"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  multi_region           = true
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS Service"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.key_prefix}-rds-key"
    Service = "RDS"
  })
}

# S3 encryption key
resource "aws_kms_key" "s3_encryption_key" {
  description             = "KMS key for S3 bucket encryption"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  multi_region           = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.key_prefix}-s3-key"
    Service = "S3"
  })
}

# Secrets encryption key
resource "aws_kms_key" "secrets_encryption_key" {
  description             = "KMS key for Secrets Manager encryption"
  deletion_window_in_days = 30
  enable_key_rotation    = true
  multi_region           = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Secrets Manager Service"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:ListGrants",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    Name = "${local.key_prefix}-secrets-key"
    Service = "SecretsManager"
  })
}

# Key aliases for human-readable identification
resource "aws_kms_alias" "rds_key_alias" {
  name          = "alias/${local.key_prefix}-rds"
  target_key_id = aws_kms_key.rds_encryption_key.key_id
}

resource "aws_kms_alias" "s3_key_alias" {
  name          = "alias/${local.key_prefix}-s3"
  target_key_id = aws_kms_key.s3_encryption_key.key_id
}

resource "aws_kms_alias" "secrets_key_alias" {
  name          = "alias/${local.key_prefix}-secrets"
  target_key_id = aws_kms_key.secrets_encryption_key.key_id
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}