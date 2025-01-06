# Core Terraform functionality for output definitions
terraform {
  required_version = ">=1.5.0"
}

# CloudWatch Log Group Names for each monitored component
output "cloudwatch_log_group_names" {
  description = "Map of CloudWatch log group names for each monitored component"
  value = {
    application = aws_cloudwatch_log_group.application_logs.name
    api         = aws_cloudwatch_log_group.api_logs.name
  }
}

# CloudWatch Log Group ARNs for each monitored component
output "cloudwatch_log_group_arns" {
  description = "Map of CloudWatch log group ARNs for each monitored component"
  value = {
    application = aws_cloudwatch_log_group.application_logs.arn
    api         = aws_cloudwatch_log_group.api_logs.arn
  }
}

# Prometheus Workspace ID and Endpoint
output "prometheus_workspace_id" {
  description = "ID of the AWS Managed Prometheus workspace for metrics collection"
  value       = var.observability_stack.prometheus_enabled ? aws_prometheus_workspace.monitoring[0].id : null
}

output "prometheus_endpoint" {
  description = "Endpoint URL for the Prometheus workspace"
  value       = var.observability_stack.prometheus_enabled ? aws_prometheus_workspace.monitoring[0].prometheus_endpoint : null
}

# CloudWatch Metric Alarm ARNs
output "metric_alarm_arns" {
  description = "Map of CloudWatch metric alarm ARNs for performance monitoring"
  value = {
    api_latency      = aws_cloudwatch_metric_alarm.api_latency.arn
    voice_processing = aws_cloudwatch_metric_alarm.voice_processing.arn
  }
}

# Datadog Integration Endpoint
output "datadog_api_endpoint" {
  description = "Datadog API endpoint for metrics ingestion"
  value       = var.datadog_config.enabled ? "https://api.datadoghq.com/api/v1/series" : null
}

# Grafana Workspace Endpoint
output "grafana_workspace_endpoint" {
  description = "Endpoint URL for the Grafana workspace"
  value       = var.observability_stack.grafana_enabled ? "https://${local.name_prefix}-grafana.${data.aws_region.current.name}.grafana.aws.amazon.com" : null
}

# ELK Stack Endpoints
output "elk_endpoints" {
  description = "Map of ELK Stack endpoints for log aggregation and analysis"
  value = var.observability_stack.elk_enabled ? {
    elasticsearch = "https://${local.name_prefix}-es.${data.aws_region.current.name}.es.amazonaws.com"
    kibana       = "https://${local.name_prefix}-kibana.${data.aws_region.current.name}.es.amazonaws.com/_plugin/kibana/"
    logstash     = "https://${local.name_prefix}-logstash.${data.aws_region.current.name}.es.amazonaws.com"
  } : {}
}

# X-Ray Sampling Rules
output "xray_sampling_rules" {
  description = "Map of X-Ray sampling rules for distributed tracing"
  value = var.observability_stack.xray_enabled ? {
    api_requests = {
      rule_name      = "${local.name_prefix}-api-requests"
      priority       = 1
      reservoir_size = 1
      fixed_rate     = 0.05
      host          = "*"
      http_method   = "*"
      url_path      = "/api/*"
      service_type  = "AWS::ApiGateway::Stage"
    }
    voice_processing = {
      rule_name      = "${local.name_prefix}-voice-processing"
      priority       = 2
      reservoir_size = 1
      fixed_rate     = 0.1
      host          = "*"
      http_method   = "*"
      url_path      = "/voice/*"
      service_type  = "AWS::Lambda::Function"
    }
  } : {}
}

# Data source for current AWS region
data "aws_region" "current" {}