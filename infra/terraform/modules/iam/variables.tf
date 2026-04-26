variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "api_secret_arn" {
  description = "ARN of the API Secrets Manager entry. Lambda role gets read access to this only."
  type        = string
}

variable "agent_secret_arn" {
  description = "ARN of the agent Secrets Manager entry. EC2 role gets read access to this only."
  type        = string
}

variable "ecr_repository_arn" {
  description = "ARN of the agent's ECR repository. EC2 role gets pull access to this only."
  type        = string
}
