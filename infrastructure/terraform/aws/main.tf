# Configure Terraform version and experimental features
terraform {
  required_version = ">= 1.5.0"
  experiments      = [module_variable_optional_attrs]

  # Configure required providers with versions
  required_providers {
    aws = {
      source  = "hashicorp/aws" # v5.0
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random" # v3.5
      version = "~> 3.5"
    }
  }

  # Configure S3 backend with encryption and state locking
  backend "s3" {
    bucket         = "revenue-platform-terraform-state"
    key            = "aws/${var.environment}/terraform.tfstate"
    region         = var.aws_region
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    kms_key_id     = "arn:aws:kms:${var.aws_region}:${data.aws_caller_identity.current.account_id}:key/terraform-state"
    versioning     = true
  }
}

# Get current AWS account ID
data "aws_caller_identity" "current" {}

# Configure AWS Provider with secure defaults
provider "aws" {
  region = var.aws_region

  # Default tags applied to all resources
  default_tags {
    Environment    = var.environment
    Project        = "revenue-platform"
    ManagedBy      = "terraform"
    Owner          = "platform-team"
    SecurityLevel  = "high"
    CostCenter     = "platform-infrastructure"
  }

  # Assume role for secure access
  assume_role {
    role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
    session_name = "TerraformSession"
  }

  # Security best practices
  default_security_group_rules = []
  ignore_tags {
    key_prefixes = ["aws:"]
  }
}

# Configure random provider for resource naming
provider "random" {}

# Local variables for resource naming and tagging
locals {
  name_prefix = "revenue-platform-${var.environment}"
  
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Region      = var.aws_region
      Terraform   = "true"
    }
  )

  # Failover region configuration
  failover_region = var.aws_region == "us-west-1" ? "us-east-1" : "us-west-1"
}

# Configure AWS provider alias for failover region
provider "aws" {
  alias  = "failover"
  region = local.failover_region

  default_tags {
    Environment    = var.environment
    Project        = "revenue-platform"
    ManagedBy      = "terraform"
    Owner          = "platform-team"
    SecurityLevel  = "high"
    CostCenter     = "platform-infrastructure"
    Region         = "failover"
  }

  assume_role {
    role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformExecutionRole"
    session_name = "TerraformFailoverSession"
  }
}

# KMS key for state encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-terraform-state-key"
    }
  )
}

# S3 bucket for Terraform state
resource "aws_s3_bucket" "terraform_state" {
  bucket = "revenue-platform-terraform-state"

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-terraform-state"
    }
  )
}

# Enable versioning on state bucket
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption on state bucket
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.terraform_state.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# Block public access to state bucket
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_state_lock" {
  name           = "terraform-state-lock"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"
  stream_enabled = true

  attribute {
    name = "LockID"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-terraform-state-lock"
    }
  )
}

# Output current region configuration
output "current_region" {
  value       = var.aws_region
  description = "Current AWS region for deployment"
}

# Output failover region configuration
output "failover_region" {
  value       = local.failover_region
  description = "Failover AWS region for high availability"
}