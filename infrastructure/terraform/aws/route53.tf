# Configure AWS provider with region
provider "aws" {
  # Provider version ~> 5.0
  region = var.aws_region
}

# Local variables for domain configuration
locals {
  domain_name = var.environment == "production" ? "revenue-platform.com" : "${var.environment}.revenue-platform.com"
}

# CloudWatch Log Group for DNS query logging
resource "aws_cloudwatch_log_group" "dns_logs" {
  name              = "/aws/route53/${local.domain_name}/queries"
  retention_in_days = 30
  
  tags = {
    Environment = var.environment
    Project     = "revenue-platform"
    ManagedBy   = "terraform"
    Service     = "dns"
  }
}

# Primary Route53 hosted zone
resource "aws_route53_zone" "main" {
  name    = local.domain_name
  comment = "Managed by Terraform - ${var.environment} environment"
  
  force_destroy = false
  enable_dnssec = true
  
  query_logging_config {
    cloudwatch_log_group_arn = aws_cloudwatch_log_group.dns_logs.arn
  }
  
  tags = {
    Environment     = var.environment
    Project         = "revenue-platform"
    ManagedBy       = "terraform"
    SecurityLevel   = "high"
    CostCenter      = "platform-infrastructure"
  }
}

# Primary application endpoint health check
resource "aws_route53_health_check" "app_primary" {
  fqdn              = "app.${local.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30
  
  regions = ["us-west-1", "us-east-1", "eu-west-1"]
  
  enable_sni        = true
  search_string     = "\"status\":\"healthy\""
  measure_latency   = true
  invert_healthcheck = false
  disabled          = false
  
  tags = {
    Environment = var.environment
    Project     = "revenue-platform"
    ManagedBy   = "terraform"
    Service     = "app"
    Type        = "primary"
  }
}

# API endpoint health check
resource "aws_route53_health_check" "api" {
  fqdn              = "api.${local.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = 3
  request_interval  = 30
  
  regions = ["us-west-1", "us-east-1", "eu-west-1"]
  
  enable_sni        = true
  search_string     = "\"status\":\"healthy\""
  measure_latency   = true
  invert_healthcheck = false
  disabled          = false
  
  tags = {
    Environment = var.environment
    Project     = "revenue-platform"
    ManagedBy   = "terraform"
    Service     = "api"
    Type        = "primary"
  }
}

# Main application DNS record with failover
resource "aws_route53_record" "app" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${local.domain_name}"
  type    = "A"
  
  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }
  
  failover_routing_policy {
    type = "PRIMARY"
  }
  
  health_check_id = aws_route53_health_check.app_primary.id
  set_identifier  = "primary"
}

# API DNS record with latency-based routing
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${local.domain_name}"
  type    = "A"
  
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
  
  latency_routing_policy {
    region = var.aws_region
  }
  
  health_check_id = aws_route53_health_check.api.id
  set_identifier  = var.aws_region
}

# DMARC record for email security
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.${local.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DMARC1; p=reject; rua=mailto:dmarc@revenue-platform.com"]
}

# ACM certificate validation record
resource "aws_route53_record" "cert_validation" {
  zone_id = aws_route53_zone.main.zone_id
  name    = aws_acm_certificate.main.domain_validation_options[0].resource_record_name
  type    = "CNAME"
  ttl     = 300
  records = [aws_acm_certificate.main.domain_validation_options[0].resource_record_value]
}

# SPF record for email authentication
resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = local.domain_name
  type    = "TXT"
  ttl     = 3600
  records = ["v=spf1 include:_spf.google.com include:amazonses.com -all"]
}

# DKIM record for email authentication
resource "aws_route53_record" "dkim" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "default._domainkey.${local.domain_name}"
  type    = "TXT"
  ttl     = 3600
  records = ["v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCrLHiExVd55zd/IQ"]
}

# Monitoring record for uptime checks
resource "aws_route53_record" "monitoring" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "status.${local.domain_name}"
  type    = "CNAME"
  ttl     = 300
  records = ["status.revenue-platform.com.statuspage.io"]
}

# Output the name servers for the hosted zone
output "nameservers" {
  value       = aws_route53_zone.main.name_servers
  description = "Name servers for the Route53 hosted zone"
}

# Output the zone ID
output "zone_id" {
  value       = aws_route53_zone.main.zone_id
  description = "Route53 hosted zone ID"
}