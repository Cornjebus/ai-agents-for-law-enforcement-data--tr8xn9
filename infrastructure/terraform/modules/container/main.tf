# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common configuration
locals {
  common_tags = {
    Environment      = var.environment
    Project         = var.project_name
    ManagedBy       = "terraform"
    SecurityLevel   = "high"
    ComplianceScope = "pci-gdpr-ccpa"
  }

  # Default container health check configuration
  default_healthcheck = {
    command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
    interval    = 30
    timeout     = 5
    retries     = 3
    startPeriod = 60
  }
}

# ECS Task Definition for API Service
resource "aws_ecs_task_definition" "api_service" {
  family                   = "${var.project_name}-api-${var.environment}"
  cpu                      = var.container_cpu["api"]
  memory                   = var.container_memory["api"]
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = var.security_config.task_execution_role_arn
  task_role_arn           = var.security_config.iam_role_arn
  container_definitions    = var.container_definitions["api"]
  enable_execute_command   = var.enable_execute_command

  # Enhanced runtime platform configuration
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture       = "X86_64"
  }

  # Volume configuration for persistent storage
  volume {
    name = "api-storage"
    efs_volume_configuration {
      file_system_id          = var.security_config.efs_filesystem_id
      root_directory          = "/api"
      transit_encryption      = "ENABLED"
      transit_encryption_port = 2999
      authorization_config {
        access_point_id = var.security_config.efs_access_point_id
        iam            = "ENABLED"
      }
    }
  }

  tags = merge(local.common_tags, {
    Service = "api"
  })
}

# ECS Service for API
resource "aws_ecs_service" "api_service" {
  name                   = "${var.project_name}-api-${var.environment}"
  cluster               = var.cluster_id
  task_definition       = aws_ecs_task_definition.api_service.arn
  desired_count         = 2
  launch_type           = "FARGATE"
  platform_version      = "LATEST"
  propagate_tags        = "SERVICE"
  enable_execute_command = var.enable_execute_command

  # Enhanced network configuration
  network_configuration {
    subnets          = var.vpc_config.private_subnets
    security_groups  = var.vpc_config.security_groups
    assign_public_ip = false
  }

  # Advanced deployment configuration
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  # Service discovery configuration
  service_registries {
    registry_arn = var.security_config.service_discovery_namespace_id
  }

  # Capacity provider strategy for cost optimization
  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base            = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 1
    base            = 0
  }

  # Load balancer configuration
  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "api"
    container_port   = 8080
  }

  # Enhanced service scheduling strategy
  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }

  # Health check grace period
  health_check_grace_period_seconds = 120

  tags = merge(local.common_tags, {
    Service = "api"
  })
}

# Auto Scaling configuration for API service
resource "aws_appautoscaling_target" "api_service" {
  max_capacity       = 10
  min_capacity       = 2
  resource_id        = "service/${var.cluster_name}/${aws_ecs_service.api_service.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based auto scaling policy
resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.project_name}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api_service.resource_id
  scalable_dimension = aws_appautoscaling_target.api_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory-based auto scaling policy
resource "aws_appautoscaling_policy" "api_memory" {
  name               = "${var.project_name}-api-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api_service.resource_id
  scalable_dimension = aws_appautoscaling_target.api_service.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api_service.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = 80
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# CloudWatch Container Insights
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = var.cluster_name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# Outputs
output "api_service_name" {
  description = "Name of the API ECS service"
  value = {
    name = aws_ecs_service.api_service.name
    id   = aws_ecs_service.api_service.id
  }
}

output "api_task_definition_arn" {
  description = "ARN of the API task definition"
  value = {
    arn      = aws_ecs_task_definition.api_service.arn
    revision = aws_ecs_task_definition.api_service.revision
  }
}