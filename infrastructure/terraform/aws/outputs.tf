# Network outputs
output "vpc_id" {
  description = "ID of the created VPC for network integration and security group configuration"
  value       = aws_vpc.vpc.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets for ALB and NAT gateway deployment"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets for ECS service and RDS deployment"
  value       = aws_subnet.private[*].id
}

# ECS outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster for service deployment and task execution"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster for service configuration and monitoring"
  value       = aws_ecs_cluster.main.name
}

# IAM role outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role for container deployments"
  value       = aws_iam_role.ecs_task_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role for application permissions"
  value       = aws_iam_role.ecs_task_role.arn
}

# KMS outputs
output "rds_kms_key_arn" {
  description = "ARN of the KMS key used for RDS encryption"
  value       = aws_kms_key.rds_encryption_key.arn
}

output "s3_kms_key_arn" {
  description = "ARN of the KMS key used for S3 bucket encryption"
  value       = aws_kms_key.s3_encryption_key.arn
}

output "secrets_kms_key_arn" {
  description = "ARN of the KMS key used for Secrets Manager encryption"
  value       = aws_kms_key.secrets_encryption_key.arn
}

# Security outputs
output "ecs_security_group_id" {
  description = "ID of the security group attached to ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

# Service discovery outputs
output "service_discovery_namespace_id" {
  description = "ID of the service discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.id
}

output "service_discovery_namespace_arn" {
  description = "ARN of the service discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.arn
}

# Monitoring outputs
output "ecs_log_group_name" {
  description = "Name of the CloudWatch log group for ECS services"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}

output "ecs_log_group_arn" {
  description = "ARN of the CloudWatch log group for ECS services"
  value       = aws_cloudwatch_log_group.ecs_logs.arn
}

# Network ACL outputs
output "network_acl_id" {
  description = "ID of the network ACL protecting VPC subnets"
  value       = aws_network_acl.main.id
}

# NAT Gateway outputs
output "nat_gateway_ips" {
  description = "List of Elastic IPs associated with NAT Gateways"
  value       = aws_eip.nat[*].public_ip
}

# Route table outputs
output "public_route_table_id" {
  description = "ID of the public route table"
  value       = aws_route_table.public.id
}

output "private_route_table_ids" {
  description = "IDs of the private route tables"
  value       = aws_route_table.private[*].id
}