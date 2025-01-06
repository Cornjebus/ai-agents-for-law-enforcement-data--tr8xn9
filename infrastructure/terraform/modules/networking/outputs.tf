# Output definitions for networking module resources
# Terraform version constraint for output type validation
terraform {
  required_version = "~> 1.5"
}

# VPC ID output for secure resource placement
output "vpc_id" {
  value       = aws_vpc.vpc.id
  description = "ID of the created VPC for secure resource placement and network integration"

  # Ensure value is not null for dependent resources
  precondition {
    condition     = aws_vpc.vpc.id != null
    error_message = "VPC ID must not be null"
  }
}

# VPC CIDR block output for network planning
output "vpc_cidr" {
  value       = aws_vpc.vpc.cidr_block
  description = "CIDR block of the created VPC for network planning and security group configurations"

  # Ensure valid CIDR block format
  precondition {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", aws_vpc.vpc.cidr_block))
    error_message = "VPC CIDR block must be in valid IPv4 CIDR notation"
  }
}

# Public subnet IDs output for internet-facing resources
output "public_subnet_ids" {
  value       = aws_subnet.public_subnets[*].id
  description = "List of public subnet IDs distributed across availability zones for internet-facing resources"

  # Ensure minimum number of subnets for high availability
  precondition {
    condition     = length(aws_subnet.public_subnets) >= 2
    error_message = "At least two public subnets are required for high availability"
  }
}

# Private subnet IDs output for internal resources
output "private_subnet_ids" {
  value       = aws_subnet.private_subnets[*].id
  description = "List of private subnet IDs distributed across availability zones for internal resources"

  # Ensure minimum number of subnets for high availability
  precondition {
    condition     = length(aws_subnet.private_subnets) >= 2
    error_message = "At least two private subnets are required for high availability"
  }
}

# NAT Gateway IDs output for private subnet internet access
output "nat_gateway_ids" {
  value       = aws_nat_gateway.nat_gateways[*].id
  description = "List of NAT gateway IDs providing secure internet access for private subnets across availability zones"

  # Ensure NAT gateways match number of private subnets
  precondition {
    condition     = length(aws_nat_gateway.nat_gateways) == length(aws_subnet.private_subnets)
    error_message = "Number of NAT gateways must match number of private subnets for high availability"
  }
}