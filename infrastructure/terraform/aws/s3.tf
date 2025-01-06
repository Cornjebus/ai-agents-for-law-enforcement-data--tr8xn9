# AWS Provider configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for bucket naming and tags
locals {
  common_tags = {
    Environment       = var.environment
    Project          = "autonomous-revenue-platform"
    ManagedBy        = "terraform"
    DataClassification = "confidential"
    ComplianceScope  = "ccpa-gdpr"
  }

  bucket_prefix = "arp-${var.environment}"
}

# Content bucket for storing generated content and assets
resource "aws_s3_bucket" "content_bucket" {
  bucket = "${local.bucket_prefix}-content"
  tags   = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-content"
    Purpose = "Content Storage"
  })
}

# Backup bucket for disaster recovery
resource "aws_s3_bucket" "backup_bucket" {
  bucket = "${local.bucket_prefix}-backup"
  tags   = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-backup"
    Purpose = "Disaster Recovery"
  })
}

# Media bucket for storing media files
resource "aws_s3_bucket" "media_bucket" {
  bucket = "${local.bucket_prefix}-media"
  tags   = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-media"
    Purpose = "Media Storage"
  })
}

# Logs bucket for access logging
resource "aws_s3_bucket" "logs_bucket" {
  bucket = "${local.bucket_prefix}-logs"
  tags   = merge(local.common_tags, {
    Name = "${local.bucket_prefix}-logs"
    Purpose = "Access Logging"
  })
}

# Versioning configuration
resource "aws_s3_bucket_versioning" "content_bucket_versioning" {
  bucket = aws_s3_bucket.content_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "backup_bucket_versioning" {
  bucket = aws_s3_bucket.backup_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption configuration
resource "aws_s3_bucket_server_side_encryption_configuration" "content_bucket_encryption" {
  bucket = aws_s3_bucket.content_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.s3_encryption_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_bucket_encryption" {
  bucket = aws_s3_bucket.backup_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.s3_encryption_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_bucket_encryption" {
  bucket = aws_s3_bucket.media_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.s3_encryption_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# Lifecycle configuration
resource "aws_s3_bucket_lifecycle_configuration" "content_bucket_lifecycle" {
  bucket = aws_s3_bucket.content_bucket.id

  rule {
    id     = "archive-old-content"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 180
      storage_class = "GLACIER"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backup_bucket_lifecycle" {
  bucket = aws_s3_bucket.backup_bucket.id

  rule {
    id     = "archive-old-backups"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs_bucket_lifecycle" {
  bucket = aws_s3_bucket.logs_bucket.id

  rule {
    id     = "archive-old-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration {
      days = 730
    }
  }
}

# Cross-region replication for backup bucket
resource "aws_s3_bucket_replication_configuration" "backup_bucket_replication" {
  bucket = aws_s3_bucket.backup_bucket.id
  role   = aws_iam_role.replication.arn

  rule {
    id     = "backup-replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.backup_bucket_replica.arn
      storage_class = "STANDARD_IA"
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }
  }
}

# Public access blocking
resource "aws_s3_bucket_public_access_block" "content_bucket_public_access_block" {
  bucket = aws_s3_bucket.content_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "backup_bucket_public_access_block" {
  bucket = aws_s3_bucket.backup_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "media_bucket_public_access_block" {
  bucket = aws_s3_bucket.media_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS configuration for media bucket
resource "aws_s3_bucket_cors_configuration" "media_bucket_cors" {
  bucket = aws_s3_bucket.media_bucket.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Intelligent tiering configuration
resource "aws_s3_bucket_intelligent_tiering_configuration" "content_bucket_intelligent_tiering" {
  bucket = aws_s3_bucket.content_bucket.id
  name   = "EntireContentBucket"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

# Logging configuration
resource "aws_s3_bucket_logging" "content_bucket_logging" {
  bucket = aws_s3_bucket.content_bucket.id

  target_bucket = aws_s3_bucket.logs_bucket.id
  target_prefix = "content-bucket-logs/"
}

resource "aws_s3_bucket_logging" "backup_bucket_logging" {
  bucket = aws_s3_bucket.backup_bucket.id

  target_bucket = aws_s3_bucket.logs_bucket.id
  target_prefix = "backup-bucket-logs/"
}