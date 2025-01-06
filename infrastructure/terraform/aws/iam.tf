# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common configurations
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution_role" {
  name                 = "${var.project_name}-ecs-execution-${var.environment}"
  description          = "ECS task execution role with enhanced security controls"
  max_session_duration = 3600
  force_detach_policies = true
  permissions_boundary = aws_iam_policy.task_boundary_policy.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# ECS Task Role
resource "aws_iam_role" "ecs_task_role" {
  name                 = "${var.project_name}-ecs-task-${var.environment}"
  description          = "ECS task role with granular service permissions"
  max_session_duration = 3600
  force_detach_policies = true
  permissions_boundary = aws_iam_policy.task_boundary_policy.arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
            "aws:MultiFactorAuthPresent": "true"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# ECS Task Execution Policy
resource "aws_iam_policy" "ecs_task_execution_policy" {
  name        = "${var.project_name}-ecs-execution-policy-${var.environment}"
  description = "Policy for ECS task execution with enhanced security"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:log-group:/aws/ecs/${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = values(var.kms_key_arns)
      }
    ]
  })

  tags = local.common_tags
}

# ECS Task Policy
resource "aws_iam_policy" "ecs_task_policy" {
  name        = "${var.project_name}-ecs-task-policy-${var.environment}"
  description = "Policy for ECS task application with granular controls"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-*",
          "arn:aws:s3:::${var.project_name}-*/*"
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-server-side-encryption": "aws:kms"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = "arn:aws:sqs:*:*:${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = "arn:aws:sns:*:*:${var.project_name}-*"
      },
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# Task Boundary Policy
resource "aws_iam_policy" "task_boundary_policy" {
  name        = "${var.project_name}-boundary-policy-${var.environment}"
  description = "Permission boundary for ECS tasks"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:*",
          "sqs:*",
          "sns:*",
          "logs:*",
          "xray:*"
        ]
        Resource = "*"
      },
      {
        Effect = "Deny"
        Action = [
          "iam:*",
          "organizations:*",
          "account:*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = local.common_tags
}

# Session Policy
resource "aws_iam_policy" "session_policy" {
  name        = "${var.project_name}-session-policy-${var.environment}"
  description = "Session policy for temporary access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "*"
        Resource = "*"
        Condition = {
          Bool = {
            "aws:MultiFactorAuthPresent": "true"
            "aws:SecureTransport": "true"
          }
          NumericLessThan = {
            "aws:MultiFactorAuthAge": "3600"
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

# Policy Attachments
resource "aws_iam_role_policy_attachment" "ecs_task_execution_policy_attachment" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = aws_iam_policy.ecs_task_execution_policy.arn
}

resource "aws_iam_role_policy_attachment" "ecs_task_policy_attachment" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_task_policy.arn
}

resource "aws_iam_role_policy_attachment" "session_policy_attachment" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.session_policy.arn
}

# Outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of ECS task execution role with enhanced security controls"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of ECS task role with granular permissions"
  value       = aws_iam_role.ecs_task_role.arn
}