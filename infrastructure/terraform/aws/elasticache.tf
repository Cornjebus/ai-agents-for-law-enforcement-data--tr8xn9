# Redis node type variable with validation
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.r6g.xlarge"

  validation {
    condition     = can(regex("^cache\\.(t3|r6g|r6gd|r5|m6g)\\.", var.redis_node_type))
    error_message = "Redis node type must be a valid instance type (cache.t3, cache.r6g, cache.r6gd, cache.r5, cache.m6g series)"
  }
}

# Redis subnet group for multi-AZ deployment
resource "aws_elasticache_subnet_group" "redis_subnet_group" {
  name        = "redis-subnet-group-${var.environment}"
  description = "Redis subnet group for ${var.environment} environment"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

# Redis parameter group with optimized settings
resource "aws_elasticache_parameter_group" "redis_parameter_group" {
  family      = "redis6.x"
  name        = "redis-params-${var.environment}"
  description = "Redis parameter group for ${var.environment} environment"

  # Performance optimization parameters
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  parameter {
    name  = "activedefrag"
    value = "yes"
  }

  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  # Security parameters
  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

# Security group for Redis cluster
resource "aws_security_group" "redis_security_group" {
  name        = "redis-security-group-${var.environment}"
  description = "Security group for Redis cluster"
  vpc_id      = aws_vpc.vpc.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app_security_group.id]
    description     = "Allow Redis traffic from application security group"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

# Redis replication group with multi-AZ support
resource "aws_elasticache_replication_group" "redis_replication_group" {
  replication_group_id          = "redis-${var.environment}"
  replication_group_description = "Redis cluster for ${var.environment} environment"
  node_type                    = var.redis_node_type
  port                         = 6379
  parameter_group_name         = aws_elasticache_parameter_group.redis_parameter_group.name
  subnet_group_name            = aws_elasticache_subnet_group.redis_subnet_group.name
  security_group_ids           = [aws_security_group.redis_security_group.id]

  # High availability configuration
  automatic_failover_enabled    = true
  multi_az_enabled             = true
  num_cache_clusters           = 3
  at_rest_encryption_enabled   = true
  transit_encryption_enabled   = true
  auth_token                   = random_password.redis_auth_token.result
  
  # Maintenance and backup settings
  maintenance_window           = "sun:05:00-sun:06:00"
  snapshot_window             = "04:00-05:00"
  snapshot_retention_limit    = 7

  # Performance settings
  engine               = "redis"
  engine_version      = "6.x"
  port                = 6379

  # Advanced configurations
  auto_minor_version_upgrade = true
  apply_immediately         = false
  notification_topic_arn    = aws_sns_topic.redis_notifications.arn

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

# Random password for Redis AUTH
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# SNS topic for Redis notifications
resource "aws_sns_topic" "redis_notifications" {
  name = "redis-notifications-${var.environment}"

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

# CloudWatch alarms for Redis monitoring
resource "aws_cloudwatch_metric_alarm" "redis_cpu_utilization" {
  alarm_name          = "redis-cpu-utilization-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "CPUUtilization"
  namespace          = "AWS/ElastiCache"
  period             = 300
  statistic          = "Average"
  threshold          = 75
  alarm_description  = "Redis cluster CPU utilization is too high"
  alarm_actions      = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis_replication_group.id
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_utilization" {
  alarm_name          = "redis-memory-utilization-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name        = "DatabaseMemoryUsagePercentage"
  namespace          = "AWS/ElastiCache"
  period             = 300
  statistic          = "Average"
  threshold          = 80
  alarm_description  = "Redis cluster memory utilization is too high"
  alarm_actions      = [aws_sns_topic.redis_notifications.arn]

  dimensions = {
    CacheClusterId = aws_elasticache_replication_group.redis_replication_group.id
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "redis-cache"
  }
}