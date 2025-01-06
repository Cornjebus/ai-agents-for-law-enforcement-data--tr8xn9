# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for common tags and naming
locals {
  tags = {
    Environment      = var.environment
    Project         = "revenue-platform"
    ManagedBy       = "terraform"
    SecurityLevel   = "high"
    ComplianceScope = "pci-gdpr-ccpa"
  }
}

# Main VPC resource with enhanced monitoring
resource "aws_vpc" "vpc" {
  cidr_block                          = var.vpc_cidr
  enable_dns_hostnames                = true
  enable_dns_support                  = true
  instance_tenancy                    = "default"
  enable_network_address_usage_metrics = true

  tags = merge(local.tags, {
    Name = "revenue-platform-vpc"
  })
}

# VPC Flow Logs for security monitoring
resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = "/aws/vpc/flow-logs"
  retention_in_days = 30
  tags              = local.tags
}

resource "aws_flow_log" "vpc_flow_log" {
  vpc_id                = aws_vpc.vpc.id
  traffic_type         = "ALL"
  log_destination_type = "cloudwatch-logs"
  log_destination      = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn         = aws_iam_role.flow_logs_role.arn

  tags = merge(local.tags, {
    Name = "vpc-flow-logs"
  })
}

# IAM role for VPC Flow Logs
resource "aws_iam_role" "flow_logs_role" {
  name = "vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = local.tags
}

# IAM policy for Flow Logs role
resource "aws_iam_role_policy" "flow_logs_policy" {
  name = "vpc-flow-logs-policy"
  role = aws_iam_role.flow_logs_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "${aws_cloudwatch_log_group.flow_logs.arn}:*"
      }
    ]
  })
}

# Public subnets across availability zones
resource "aws_subnet" "public_subnets" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.vpc.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.tags, {
    Name = "public-subnet-${var.availability_zones[count.index]}"
    Tier = "public"
  })
}

# Private subnets across availability zones
resource "aws_subnet" "private_subnets" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.vpc.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = merge(local.tags, {
    Name = "private-subnet-${var.availability_zones[count.index]}"
    Tier = "private"
  })
}

# Internet Gateway for public access
resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.vpc.id

  tags = merge(local.tags, {
    Name = "main-igw"
  })
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat_eips" {
  count  = length(var.availability_zones)
  domain = "vpc"

  tags = merge(local.tags, {
    Name = "nat-eip-${var.availability_zones[count.index]}"
  })
}

# NAT Gateways for private subnet internet access
resource "aws_nat_gateway" "nat_gateways" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat_eips[count.index].id
  subnet_id     = aws_subnet.public_subnets[count.index].id

  tags = merge(local.tags, {
    Name = "nat-gateway-${var.availability_zones[count.index]}"
  })

  depends_on = [aws_internet_gateway.igw]
}

# Route table for public subnets
resource "aws_route_table" "public_route_table" {
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = merge(local.tags, {
    Name = "public-route-table"
  })
}

# Route tables for private subnets
resource "aws_route_table" "private_route_tables" {
  count  = length(var.availability_zones)
  vpc_id = aws_vpc.vpc.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat_gateways[count.index].id
  }

  tags = merge(local.tags, {
    Name = "private-route-table-${var.availability_zones[count.index]}"
  })
}

# Route table associations for public subnets
resource "aws_route_table_association" "public_route_associations" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public_subnets[count.index].id
  route_table_id = aws_route_table.public_route_table.id
}

# Route table associations for private subnets
resource "aws_route_table_association" "private_route_associations" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.private_subnets[count.index].id
  route_table_id = aws_route_table.private_route_tables[count.index].id
}

# VPC Endpoints for AWS services
resource "aws_vpc_endpoint" "s3_endpoint" {
  vpc_id       = aws_vpc.vpc.id
  service_name = "com.amazonaws.${data.aws_region.current.name}.s3"
  
  route_table_ids = aws_route_table.private_route_tables[*].id
  
  tags = merge(local.tags, {
    Name = "s3-vpc-endpoint"
  })
}

# Network ACLs with enhanced security rules
resource "aws_network_acl" "private_nacl" {
  vpc_id     = aws_vpc.vpc.id
  subnet_ids = aws_subnet.private_subnets[*].id

  ingress {
    protocol   = "tcp"
    rule_no    = 100
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 443
    to_port    = 443
  }

  ingress {
    protocol   = "tcp"
    rule_no    = 110
    action     = "allow"
    cidr_block = var.vpc_cidr
    from_port  = 80
    to_port    = 80
  }

  egress {
    protocol   = -1
    rule_no    = 100
    action     = "allow"
    cidr_block = "0.0.0.0/0"
    from_port  = 0
    to_port    = 0
  }

  tags = merge(local.tags, {
    Name = "private-nacl"
  })
}

# Data source for current AWS region
data "aws_region" "current" {}

# Outputs for use in other modules
output "vpc_id" {
  value       = aws_vpc.vpc.id
  description = "The ID of the VPC"
}

output "vpc_cidr" {
  value       = aws_vpc.vpc.cidr_block
  description = "The CIDR block of the VPC"
}

output "public_subnet_ids" {
  value       = aws_subnet.public_subnets[*].id
  description = "List of public subnet IDs"
}

output "private_subnet_ids" {
  value       = aws_subnet.private_subnets[*].id
  description = "List of private subnet IDs"
}

output "nat_gateway_ips" {
  value       = aws_eip.nat_eips[*].public_ip
  description = "List of NAT Gateway public IPs"
}