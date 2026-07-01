variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "aws_region" {
  description = "AWS region (used by user-data for AWS CLI calls)."
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. Default t3.small (2 vCPU, 2GB RAM) per roadmap."
  type        = string
  default     = "t3.small"
}

variable "subnet_id" {
  description = "Subnet to launch the instance in."
  type        = string
}

variable "security_group_id" {
  description = "Security group ID (egress-only, from modules/networking)."
  type        = string
}

variable "instance_profile_name" {
  description = "EC2 instance profile name (from modules/iam)."
  type        = string
}

variable "secret_name" {
  description = "Secrets Manager secret name to fetch at boot (e.g. 'nexus-aec/prod/agent')."
  type        = string
}

variable "ecr_registry" {
  description = "ECR registry hostname (<account>.dkr.ecr.<region>.amazonaws.com)."
  type        = string
}

variable "ecr_repository" {
  description = "ECR repository name (e.g. 'nexus-aec-prod-agent')."
  type        = string
}

variable "image_tag" {
  description = "Docker image tag to pull. Default 'latest' — override for pinned deploys."
  type        = string
  default     = "latest"
}

variable "log_group_name" {
  description = "CloudWatch Logs group for the agent container. Default: /aws/ec2/<name_prefix>-agent."
  type        = string
  default     = null
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for agent container logs."
  type        = number
  default     = 30
}

variable "root_volume_gb" {
  description = "Root EBS volume size."
  type        = number
  default     = 30
}

variable "allocate_eip" {
  description = "Allocate an Elastic IP so the public IP survives instance restarts."
  type        = bool
  default     = true
}
