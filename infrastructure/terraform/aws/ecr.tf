# Configure AWS provider with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Configure primary and secondary region providers
provider "aws" {
  region = var.aws_region
}

provider "aws" {
  alias  = "secondary"
  region = var.secondary_region
}

# Local variables for common configuration
locals {
  repository_names = ["api", "web", "worker"]
  common_tags = {
    Project         = var.project_name
    Environment     = var.environment
    ManagedBy       = "terraform"
    SecurityLevel   = "high"
    ReplicationType = "cross-region"
  }
}

# ECR repositories for each service
resource "aws_ecr_repository" "service_repos" {
  for_each = toset(local.repository_names)

  name = "${var.project_name}-${var.environment}-${each.key}"
  
  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "KMS"
    kms_key        = var.kms_key_id
  }

  image_tag_mutability = "IMMUTABLE"
  
  force_delete = var.environment != "production"

  tags = merge(local.common_tags, {
    ServiceName = each.key
  })
}

# Cross-region replication configuration
resource "aws_ecr_replication_configuration" "cross_region" {
  replication_configuration {
    rules {
      destinations {
        region      = var.secondary_region
        registry_id = data.aws_caller_identity.current.account_id
      }
    }
  }
}

# Lifecycle policy for each repository
resource "aws_ecr_lifecycle_policy" "lifecycle_policy" {
  for_each      = aws_ecr_repository.service_repos

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 production release images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["release-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images older than 14 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 14
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Repository policy for access control
resource "aws_ecr_repository_policy" "repo_policy" {
  for_each      = aws_ecr_repository.service_repos

  repository = each.value.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowPullFromECS"
        Effect = "Allow"
        Principal = {
          Service = "ecs.amazonaws.com"
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
      },
      {
        Sid    = "AllowCrossAccountPull"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability"
        ]
        Condition = {
          StringEquals = {
            "aws:PrincipalOrgID": data.aws_organizations_organization.current.id
          }
        }
      }
    ]
  })
}

# Pull through cache for base images
resource "aws_ecr_pull_through_cache_rule" "base_images" {
  ecr_repository_prefix = "base-images"
  upstream_registry_url = "public.ecr.aws"
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_organizations_organization" "current" {}

# Outputs
output "repository_urls" {
  description = "Map of repository names to their URLs"
  value = {
    for repo in aws_ecr_repository.service_repos :
    repo.name => repo.repository_url
  }
}

output "registry_id" {
  description = "The registry ID where the repositories were created"
  value       = data.aws_caller_identity.current.account_id
}

output "repository_arns" {
  description = "Map of repository names to their ARNs"
  value = {
    for repo in aws_ecr_repository.service_repos :
    repo.name => repo.arn
  }
}