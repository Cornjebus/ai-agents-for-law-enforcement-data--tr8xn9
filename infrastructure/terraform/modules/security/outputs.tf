# Security group outputs with enhanced documentation and sensitivity flags
output "security_group_ids" {
  description = <<-EOT
    Security group IDs with granular access controls and enhanced security documentation.
    These security groups implement strict network access controls as per compliance requirements.
    SENSITIVITY: HIGH - Contains network security configuration
  EOT
  value = {
    app = aws_security_group.app.id
    db  = aws_security_group.db.id
  }
  sensitive = true
}

# KMS key outputs with compliance documentation
output "kms_key_arns" {
  description = <<-EOT
    KMS key ARNs for data encryption using AES-256-GCM.
    Keys are configured with automatic rotation and compliance monitoring.
    COMPLIANCE: CCPA, GDPR, SOC2
    SENSITIVITY: HIGH - Contains encryption key identifiers
  EOT
  value = {
    rds = aws_kms_key.rds.arn
    s3  = aws_kms_key.s3.arn
  }
  sensitive = true
}

# WAF Web ACL output with security control documentation
output "waf_web_acl_arn" {
  description = <<-EOT
    WAF Web ACL ARN with advanced security rules and DDoS protection.
    Implements rate-limiting, SQL injection protection, and geo-restriction.
    SECURITY CONTROLS: 
    - Rate limiting: ${var.waf_rate_limit} requests per 5 minutes
    - Geographic restriction: US-only access
    - SQL injection protection enabled
  EOT
  value = {
    arn = aws_wafv2_web_acl.main.arn
  }
}

# IAM role outputs with RBAC documentation
output "iam_role_arns" {
  description = <<-EOT
    IAM role ARNs with least-privilege access controls.
    Roles are configured with specific permissions for application components.
    SENSITIVITY: HIGH - Contains IAM role identifiers
  EOT
  value = {
    app_role_arn    = aws_iam_role.app.arn
    lambda_role_arn = aws_iam_role.lambda.arn
  }
  sensitive = true
}

# Compliance and audit configuration outputs
output "compliance_config" {
  description = <<-EOT
    Security compliance and audit configuration details.
    Includes logging, monitoring, and audit trail configurations.
    COMPLIANCE FEATURES:
    - CloudWatch Logs integration
    - Audit logging enabled
    - S3 audit trail with encryption
  EOT
  value = {
    log_group_arn     = var.enable_cloudwatch_logs ? aws_cloudwatch_log_group.security[0].arn : null
    audit_trail_bucket = aws_s3_bucket.audit_logs.id
    encryption_config = {
      kms_rotation_enabled = true
      log_encryption      = "AES-256-GCM"
    }
  }
}

# Security monitoring outputs
output "monitoring_config" {
  description = <<-EOT
    Security monitoring and alerting configuration.
    Provides endpoints and configurations for security monitoring tools.
    MONITORING FEATURES:
    - WAF metrics enabled
    - CloudWatch integration
    - Security event logging
  EOT
  value = {
    waf_metrics_enabled = true
    cloudwatch_enabled  = var.enable_cloudwatch_logs
    log_retention_days = var.log_retention_days
  }
}