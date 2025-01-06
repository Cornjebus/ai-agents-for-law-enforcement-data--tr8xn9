# AWS API Gateway module with Kong integration
# Version: 1.0.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kong = {
      source  = "kong/kong"
      version = "~> 6.0"
    }
  }
}

# CloudWatch Log Group for API Gateway access logging
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${var.environment}-${var.project_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags

  kms_key_id = aws_kms_key.log_encryption.arn
}

# KMS key for log encryption
resource "aws_kms_key" "log_encryption" {
  description             = "KMS key for API Gateway log encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true
  tags                   = var.tags
}

# Main API Gateway REST API
resource "aws_api_gateway_rest_api" "main" {
  name        = "${var.environment}-${var.project_name}"
  description = "API Gateway for the Autonomous Revenue Generation Platform"

  endpoint_configuration {
    types = [var.endpoint_type]
    vpc_endpoint_ids = var.endpoint_type == "PRIVATE" ? [var.vpc_endpoint_ids] : []
  }

  binary_media_types = [
    "multipart/form-data",
    "application/octet-stream"
  ]

  minimum_compression_size = 1024
  api_key_source          = "HEADER"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = "*"
        Action = "execute-api:Invoke"
        Resource = "*"
        Condition = {
          IpAddress = {
            "aws:SourceIp" = var.waf_settings.enabled ? ["0.0.0.0/0"] : var.allowed_ips
          }
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Environment = var.environment
      Name        = "${var.environment}-${var.project_name}-api"
    }
  )
}

# API Gateway deployment
resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.main.id

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_rest_api.main.body,
      aws_api_gateway_stage.main.stage_name
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway stage with comprehensive logging and monitoring
resource "aws_api_gateway_stage" "main" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id  = aws_api_gateway_rest_api.main.id
  stage_name   = var.environment

  cache_cluster_enabled = var.enable_caching
  cache_cluster_size   = var.cache_settings.size
  xray_tracing_enabled = var.monitoring_settings.trace_enabled

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      ip                = "$context.identity.sourceIp"
      caller            = "$context.identity.caller"
      user              = "$context.identity.user"
      requestTime       = "$context.requestTime"
      httpMethod        = "$context.httpMethod"
      resourcePath      = "$context.resourcePath"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength    = "$context.responseLength"
      integrationLatency = "$context.integrationLatency"
    })
  }

  tags = merge(
    var.tags,
    {
      Environment = var.environment
      Name        = "${var.environment}-${var.project_name}-stage"
    }
  )
}

# WAF association for API Gateway protection
resource "aws_wafv2_web_acl_association" "api_gateway" {
  count        = var.waf_settings.enabled ? 1 : 0
  resource_arn = aws_api_gateway_stage.main.arn
  web_acl_arn  = var.waf_web_acl_arn
}

# Global method settings with rate limiting and caching
resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.main.id
  stage_name  = aws_api_gateway_stage.main.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled        = var.monitoring_settings.detailed_metrics_enabled
    logging_level         = var.monitoring_settings.logging_level
    data_trace_enabled    = var.monitoring_settings.trace_enabled
    throttling_burst_limit = var.rate_limit_settings.burst_limit
    throttling_rate_limit = var.rate_limit_settings.rate_limit
    caching_enabled      = var.enable_caching
    cache_ttl_in_seconds = var.cache_settings.ttl
    cache_data_encrypted = var.cache_settings.data_encrypted
  }
}

# VPC Link for private API Gateway integration
resource "aws_api_gateway_vpc_link" "main" {
  count       = var.endpoint_type == "PRIVATE" ? 1 : 0
  name        = "${var.environment}-${var.project_name}-vpc-link"
  target_arns = [var.nlb_arn]
  tags        = var.tags
}

# Outputs
output "api_gateway_id" {
  description = "ID of the created API Gateway REST API"
  value       = aws_api_gateway_rest_api.main.id
}

output "api_gateway_stage_arn" {
  description = "ARN of the API Gateway stage"
  value       = aws_api_gateway_stage.main.arn
}

output "execution_arn" {
  description = "Execution ARN of the API Gateway"
  value       = aws_api_gateway_rest_api.main.execution_arn
}

output "vpc_link_id" {
  description = "ID of the VPC Link if created"
  value       = var.endpoint_type == "PRIVATE" ? aws_api_gateway_vpc_link.main[0].id : null
}