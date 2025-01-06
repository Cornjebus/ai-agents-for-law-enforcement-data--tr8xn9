# Terraform version constraint
terraform {
  required_version = ">=1.5.0"
}

# VPC CIDR block variable with validation
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC with /16 subnet mask for optimal address space"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block in format x.x.x.x/x"
  }
}

# Availability Zones variable with HA validation
variable "availability_zones" {
  type        = list(string)
  description = "List of AWS Availability Zones for multi-AZ high availability deployment"

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones must be specified for high availability requirements"
  }
}

# Public subnet CIDR blocks with validation
variable "public_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for public subnets, one per availability zone"

  validation {
    condition     = length(var.public_subnet_cidrs) >= 2 && length(var.public_subnet_cidrs) == length(var.availability_zones)
    error_message = "Number of public subnet CIDRs must match number of availability zones and be at least 2 for HA"
  }

  validation {
    condition     = alltrue([for cidr in var.public_subnet_cidrs : can(cidrhost(cidr, 0))])
    error_message = "All public subnet CIDRs must be valid IPv4 CIDR blocks"
  }
}

# Private subnet CIDR blocks with validation
variable "private_subnet_cidrs" {
  type        = list(string)
  description = "CIDR blocks for private subnets, one per availability zone"

  validation {
    condition     = length(var.private_subnet_cidrs) >= 2 && length(var.private_subnet_cidrs) == length(var.availability_zones)
    error_message = "Number of private subnet CIDRs must match number of availability zones and be at least 2 for HA"
  }

  validation {
    condition     = alltrue([for cidr in var.private_subnet_cidrs : can(cidrhost(cidr, 0))])
    error_message = "All private subnet CIDRs must be valid IPv4 CIDR blocks"
  }
}

# NAT Gateway configuration
variable "enable_nat_gateway" {
  type        = bool
  description = "Enable NAT Gateway for private subnet internet access"
  default     = true
}

# VPN Gateway configuration
variable "enable_vpn_gateway" {
  type        = bool
  description = "Enable VPN Gateway for secure hybrid cloud connectivity"
  default     = false
}

# Network ACL rules configuration
variable "network_acls" {
  type = map(object({
    ingress_rules = list(object({
      rule_number = number
      protocol    = string
      action      = string
      cidr_block  = string
      from_port   = number
      to_port     = number
    }))
    egress_rules = list(object({
      rule_number = number
      protocol    = string
      action      = string
      cidr_block  = string
      from_port   = number
      to_port     = number
    }))
  }))
  description = "Network ACL rules for enhanced subnet security"
  default     = {}
}

# Flow logs configuration
variable "enable_flow_logs" {
  type        = bool
  description = "Enable VPC Flow Logs for network traffic monitoring"
  default     = true
}

# Flow logs retention configuration
variable "flow_logs_retention_days" {
  type        = number
  description = "Number of days to retain VPC Flow Logs"
  default     = 30

  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "Flow logs retention days must be one of [0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653]"
  }
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Resource tags for security and compliance tracking"
  default = {
    Module             = "networking"
    ManagedBy         = "terraform"
    Environment       = "production"
    SecurityZone      = "restricted"
    ComplianceLevel   = "high"
    DataClassification = "confidential"
  }
}

# DNS configuration
variable "enable_dns_hostnames" {
  type        = bool
  description = "Enable DNS hostnames in the VPC"
  default     = true
}

variable "enable_dns_support" {
  type        = bool
  description = "Enable DNS support in the VPC"
  default     = true
}

# VPC endpoint configuration
variable "vpc_endpoints" {
  type        = list(string)
  description = "List of AWS services to create VPC endpoints for"
  default     = ["s3", "dynamodb"]

  validation {
    condition     = alltrue([for endpoint in var.vpc_endpoints : contains(["s3", "dynamodb", "secretsmanager", "ecr.api", "ecr.dkr", "ecs", "logs", "monitoring"], endpoint)])
    error_message = "Invalid VPC endpoint specified. Must be one of: s3, dynamodb, secretsmanager, ecr.api, ecr.dkr, ecs, logs, monitoring"
  }
}