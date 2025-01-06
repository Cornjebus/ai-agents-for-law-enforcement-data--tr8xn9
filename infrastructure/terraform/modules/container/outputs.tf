# Output definitions for container module
# Version: 1.0
# Supports: AWS ECS Fargate container orchestration

# API Service name output for service discovery and cross-module references
output "api_service_name" {
  description = "Name of the API ECS service for service discovery and DNS resolution"
  value       = aws_ecs_service.api_service.name
  sensitive   = false
}

# Worker Service name output for service discovery and cross-module references
output "worker_service_name" {
  description = "Name of the Worker ECS service for service discovery and DNS resolution"
  value       = aws_ecs_service.worker_service.name
  sensitive   = false
}

# API Task Definition ARN for service updates and deployments
output "api_task_definition_arn" {
  description = "ARN of the API task definition for service updates and version tracking"
  value       = aws_ecs_task_definition.api_service.arn
  sensitive   = false
}

# Worker Task Definition ARN for service updates and deployments
output "worker_task_definition_arn" {
  description = "ARN of the Worker task definition for service updates and version tracking"
  value       = aws_ecs_task_definition.worker_service.arn
  sensitive   = false
}

# API Service ID for CloudWatch metrics and infrastructure automation
output "api_service_id" {
  description = "ID of the API ECS service for CloudWatch metrics and monitoring"
  value       = aws_ecs_service.api_service.id
  sensitive   = false
}

# Worker Service ID for CloudWatch metrics and infrastructure automation
output "worker_service_id" {
  description = "ID of the Worker ECS service for CloudWatch metrics and monitoring"
  value       = aws_ecs_service.worker_service.id
  sensitive   = false
}

# API Service cluster ARN for cross-account access and IAM policies
output "api_service_cluster_arn" {
  description = "ARN of the ECS cluster running the API service"
  value       = aws_ecs_service.api_service.cluster
  sensitive   = false
}

# Worker Service cluster ARN for cross-account access and IAM policies
output "worker_service_cluster_arn" {
  description = "ARN of the ECS cluster running the Worker service"
  value       = aws_ecs_service.worker_service.cluster
  sensitive   = false
}

# API Service desired count for scaling operations
output "api_service_desired_count" {
  description = "Desired count of API service tasks for scaling operations"
  value       = aws_ecs_service.api_service.desired_count
  sensitive   = false
}

# Worker Service desired count for scaling operations
output "worker_service_desired_count" {
  description = "Desired count of Worker service tasks for scaling operations"
  value       = aws_ecs_service.worker_service.desired_count
  sensitive   = false
}

# API Service launch type for infrastructure planning
output "api_service_launch_type" {
  description = "Launch type of the API service (FARGATE/EC2)"
  value       = aws_ecs_service.api_service.launch_type
  sensitive   = false
}

# Worker Service launch type for infrastructure planning
output "worker_service_launch_type" {
  description = "Launch type of the Worker service (FARGATE/EC2)"
  value       = aws_ecs_service.worker_service.launch_type
  sensitive   = false
}

# API Service network configuration for networking modules
output "api_service_network_configuration" {
  description = "Network configuration of the API service including subnets and security groups"
  value       = aws_ecs_service.api_service.network_configuration
  sensitive   = true
}

# Worker Service network configuration for networking modules
output "worker_service_network_configuration" {
  description = "Network configuration of the Worker service including subnets and security groups"
  value       = aws_ecs_service.worker_service.network_configuration
  sensitive   = true
}

# API Service platform version for compatibility checks
output "api_service_platform_version" {
  description = "Platform version of the API service for compatibility verification"
  value       = aws_ecs_service.api_service.platform_version
  sensitive   = false
}

# Worker Service platform version for compatibility checks
output "worker_service_platform_version" {
  description = "Platform version of the Worker service for compatibility verification"
  value       = aws_ecs_service.worker_service.platform_version
  sensitive   = false
}

# Combined service health status for monitoring
output "service_health" {
  description = "Combined health status of all ECS services"
  value = {
    api_service_status    = aws_ecs_service.api_service.status
    worker_service_status = aws_ecs_service.worker_service.status
  }
  sensitive = false
}

# Task definition configurations for service updates
output "task_definitions" {
  description = "Complete task definition configurations for both services"
  value = {
    api = {
      family                = aws_ecs_task_definition.api_service.family
      revision             = aws_ecs_task_definition.api_service.revision
      cpu                  = aws_ecs_task_definition.api_service.cpu
      memory               = aws_ecs_task_definition.api_service.memory
      execution_role_arn   = aws_ecs_task_definition.api_service.execution_role_arn
      task_role_arn        = aws_ecs_task_definition.api_service.task_role_arn
    }
    worker = {
      family                = aws_ecs_task_definition.worker_service.family
      revision             = aws_ecs_task_definition.worker_service.revision
      cpu                  = aws_ecs_task_definition.worker_service.cpu
      memory               = aws_ecs_task_definition.worker_service.memory
      execution_role_arn   = aws_ecs_task_definition.worker_service.execution_role_arn
      task_role_arn        = aws_ecs_task_definition.worker_service.task_role_arn
    }
  }
  sensitive = true
}