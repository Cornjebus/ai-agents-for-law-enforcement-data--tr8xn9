# API Gateway REST API ID output
output "api_gateway_id" {
  description = "The ID of the created API Gateway REST API"
  value       = aws_api_gateway_rest_api.main.id
}

# API Gateway execution ARN output for Lambda permissions
output "api_gateway_execution_arn" {
  description = "The execution ARN of the API Gateway for Lambda permissions"
  value       = aws_api_gateway_rest_api.main.execution_arn
}

# API Gateway endpoint URL output
output "api_gateway_endpoint" {
  description = "The invoke URL of the API Gateway stage"
  value       = aws_api_gateway_stage.main.invoke_url
}

# VPC Link ID output for private integrations
output "vpc_link_id" {
  description = "The ID of the VPC Link for private integrations"
  value       = var.endpoint_type == "PRIVATE" ? aws_api_gateway_vpc_link.main[0].id : null
}

# Stage ARN output for WAF association
output "api_gateway_stage_arn" {
  description = "The ARN of the API Gateway stage for WAF association"
  value       = aws_api_gateway_stage.main.arn
}

# Stage name output for resource configurations
output "stage_name" {
  description = "The name of the deployed API Gateway stage"
  value       = aws_api_gateway_stage.main.stage_name
}

# CloudWatch log group ARN output
output "cloudwatch_log_group_arn" {
  description = "The ARN of the CloudWatch Log Group for API Gateway access logs"
  value       = aws_cloudwatch_log_group.api_gateway.arn
}

# KMS key ARN output for log encryption
output "log_encryption_key_arn" {
  description = "The ARN of the KMS key used for log encryption"
  value       = aws_kms_key.log_encryption.arn
}