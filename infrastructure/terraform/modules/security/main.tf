# AWS Provider configuration with enhanced security features
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common resource configuration
locals {
  common_tags = {
    Environment         = var.environment
    Project            = "autonomous-revenue-platform"
    ManagedBy          = "terraform"
    ComplianceLevel    = "high"
    DataClassification = "sensitive"
    SecurityZone       = "restricted"
  }

  # Enhanced security group rules with strict access controls
  security_rules = {
    app = {
      ingress = [
        {
          description = "HTTPS from ALB"
          from_port   = 443
          to_port     = 443
          protocol    = "tcp"
          cidr_blocks = var.allowed_cidr_blocks
        }
      ]
      egress = [
        {
          description = "Allow all outbound"
          from_port   = 0
          to_port     = 0
          protocol    = "-1"
          cidr_blocks = ["0.0.0.0/0"]
        }
      ]
    }
    db = {
      ingress = [
        {
          description     = "PostgreSQL from App"
          from_port      = 5432
          to_port        = 5432
          protocol       = "tcp"
          security_group = "app"
        }
      ]
    }
    cache = {
      ingress = [
        {
          description     = "Redis from App"
          from_port      = 6379
          to_port        = 6379
          protocol       = "tcp"
          security_group = "app"
        }
      ]
    }
  }
}

# KMS key for RDS encryption with automatic rotation
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = var.kms_key_deletion_window
  enable_key_rotation    = true
  policy                = data.aws_iam_policy_document.kms_policy.json
  tags                  = merge(local.common_tags, { Service = "RDS" })
}

# KMS key for S3 encryption
resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 encryption"
  deletion_window_in_days = var.kms_key_deletion_window
  enable_key_rotation    = true
  policy                = data.aws_iam_policy_document.kms_policy.json
  tags                  = merge(local.common_tags, { Service = "S3" })
}

# KMS key for Secrets Manager
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Secrets Manager"
  deletion_window_in_days = var.kms_key_deletion_window
  enable_key_rotation    = true
  policy                = data.aws_iam_policy_document.kms_policy.json
  tags                  = merge(local.common_tags, { Service = "SecretsManager" })
}

# WAF Web ACL with enhanced security rules
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-${var.environment}-waf"
  description = "WAF Web ACL with enhanced security rules"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rate-based rule for DDoS protection
  rule {
    name     = "RateBasedRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateBasedRule"
      sampled_requests_enabled  = true
    }
  }

  # SQL injection protection
  rule {
    name     = "SQLInjectionRule"
    priority = 2

    override_action {
      none {}
    }

    statement {
      sql_injection_match_statement {
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 1
          type     = "URL_DECODE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "SQLInjectionRule"
      sampled_requests_enabled  = true
    }
  }

  # Geo-restriction rule
  rule {
    name     = "GeoRestrictionRule"
    priority = 3

    override_action {
      none {}
    }

    statement {
      geo_match_statement {
        country_codes = ["US"] # Restrict to US as per requirements
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "GeoRestrictionRule"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${var.project_name}-${var.environment}-waf"
    sampled_requests_enabled  = true
  }

  tags = local.common_tags
}

# Security Groups with strict access controls
resource "aws_security_group" "app" {
  name_prefix = "${var.project_name}-${var.environment}-app"
  vpc_id      = var.vpc_id
  description = "Security group for application servers"

  dynamic "ingress" {
    for_each = local.security_rules.app.ingress
    content {
      description = ingress.value.description
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
    }
  }

  dynamic "egress" {
    for_each = local.security_rules.app.egress
    content {
      description = egress.value.description
      from_port   = egress.value.from_port
      to_port     = egress.value.to_port
      protocol    = egress.value.protocol
      cidr_blocks = egress.value.cidr_blocks
    }
  }

  tags = merge(local.common_tags, { Service = "Application" })
}

# CloudWatch Log Group for security monitoring
resource "aws_cloudwatch_log_group" "security" {
  count             = var.enable_cloudwatch_logs ? 1 : 0
  name              = "/aws/security/${var.project_name}/${var.environment}"
  retention_in_days = var.log_retention_days
  kms_key_id       = aws_kms_key.secrets.arn
  tags             = merge(local.common_tags, { Service = "Security" })
}

# S3 Bucket for audit logs with encryption
resource "aws_s3_bucket" "audit_logs" {
  bucket = "${var.project_name}-${var.environment}-audit-logs"
  tags   = merge(local.common_tags, { Service = "Audit" })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# Outputs for use in other modules
output "security_group_ids" {
  description = "Security group IDs with granular access controls"
  value = {
    app_security_group_id   = aws_security_group.app.id
    db_security_group_id    = aws_security_group.db.id
    cache_security_group_id = aws_security_group.cache.id
  }
}

output "kms_key_arns" {
  description = "KMS key ARNs with enhanced rotation policies"
  value = {
    rds_key_arn     = aws_kms_key.rds.arn
    s3_key_arn      = aws_kms_key.s3.arn
    secrets_key_arn = aws_kms_key.secrets.arn
  }
}

output "waf_web_acl_arn" {
  description = "WAF Web ACL ARN with advanced rule configurations"
  value = {
    arn   = aws_wafv2_web_acl.main.arn
    rules = aws_wafv2_web_acl.main.rule
  }
}

output "compliance_config" {
  description = "Compliance-related resource configurations"
  value = {
    log_group_arn     = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.security[0].arn : null
    audit_trail_bucket = aws_s3_bucket.audit_logs.id
  }
}