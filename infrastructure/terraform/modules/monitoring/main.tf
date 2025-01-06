# Provider configurations
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    datadog = {
      source  = "DataDog/datadog"
      version = "~> 3.0"
    }
  }
}

# Local variables for enhanced resource naming and tagging
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = merge(
    var.tags,
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "monitoring"
    }
  )

  # Monitoring-specific configurations
  log_retention_days = lookup(var.retention_config, "cloudwatch_days", 30)
  prometheus_retention_days = lookup(var.retention_config, "prometheus_days", 15)
  
  # Performance threshold configurations
  performance_config = {
    api_latency_threshold     = var.performance_thresholds.api_latency_ms
    voice_rtt_threshold      = var.performance_thresholds.voice_rtt_ms
    content_gen_threshold    = var.performance_thresholds.content_gen_timeout_sec
    db_query_threshold      = var.performance_thresholds.db_query_ms
  }
}

# CloudWatch Log Groups with encryption and compliance features
resource "aws_cloudwatch_log_group" "application_logs" {
  name              = "/aws/application/${local.name_prefix}"
  retention_in_days = local.log_retention_days
  kms_key_id       = lookup(var.log_groups, "application", {}).kms_key_id
  tags             = local.common_tags
}

resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/api/${local.name_prefix}"
  retention_in_days = local.log_retention_days
  kms_key_id       = lookup(var.log_groups, "api", {}).kms_key_id
  tags             = local.common_tags
}

# Prometheus Workspace for metric collection
resource "aws_prometheus_workspace" "monitoring" {
  count = var.observability_stack.prometheus_enabled ? 1 : 0
  
  alias = "${local.name_prefix}-prometheus"
  
  logging_configuration {
    log_group_arn = "${aws_cloudwatch_log_group.application_logs.arn}:*"
  }
  
  tags = local.common_tags
}

# CloudWatch Metric Alarms for performance monitoring
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name_prefix}-api-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "Latency"
  namespace          = "AWS/ApiGateway"
  period             = 60
  statistic          = "Average"
  threshold          = local.performance_config.api_latency_threshold
  alarm_description  = "API Gateway latency exceeded threshold"
  alarm_actions      = lookup(var.metric_alarms, "api_latency", {}).alarm_actions
  
  dimensions = {
    ApiName = "${local.name_prefix}-api"
  }
  
  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "voice_processing" {
  alarm_name          = "${local.name_prefix}-voice-rtt"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "ProcessingTime"
  namespace          = "Custom/VoiceService"
  period             = 60
  statistic          = "Average"
  threshold          = local.performance_config.voice_rtt_threshold
  alarm_description  = "Voice processing RTT exceeded threshold"
  alarm_actions      = lookup(var.metric_alarms, "voice_rtt", {}).alarm_actions
  
  tags = local.common_tags
}

# Datadog integration for APM and custom metrics
resource "datadog_monitor" "api_performance" {
  count   = var.datadog_config.enabled ? 1 : 0
  name    = "${local.name_prefix}-api-performance"
  type    = "metric alert"
  message = "API performance degraded: {{value}} ms > ${local.performance_config.api_latency_threshold}ms\n\n{{#is_alert}}@pagerduty{{/is_alert}}"
  
  query = "avg(last_5m):avg:aws.apigateway.latency{environment:${var.environment}} > ${local.performance_config.api_latency_threshold}"
  
  monitor_thresholds {
    critical = local.performance_config.api_latency_threshold
    warning  = local.performance_config.api_latency_threshold * 0.8
  }
  
  include_tags = true
  
  tags = [
    "env:${var.environment}",
    "service:api",
    "managed-by:terraform"
  ]
}

# Export monitoring resource information
output "cloudwatch_log_group_name" {
  description = "Name of the main CloudWatch log group"
  value       = aws_cloudwatch_log_group.application_logs.name
}

output "prometheus_workspace_id" {
  description = "ID of the Prometheus workspace"
  value       = var.observability_stack.prometheus_enabled ? aws_prometheus_workspace.monitoring[0].id : null
}

output "metric_alarm_arns" {
  description = "ARNs of created CloudWatch metric alarms"
  value = [
    aws_cloudwatch_metric_alarm.api_latency.arn,
    aws_cloudwatch_metric_alarm.voice_processing.arn
  ]
}