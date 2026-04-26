# ── Foundation outputs ────────────────────────────────────────────────────────

output "ecr_repository_url" {
  description = "Push agent images here: docker tag ... <this>:tag && docker push <this>:tag"
  value       = module.ecr.repository_url
}

output "ecr_repository_arn" {
  description = "ARN of the agent ECR repository."
  value       = module.ecr.repository_arn
}

output "api_secret_name" {
  description = "Secrets Manager secret name for the API. Set as SECRET_NAME env var on the Lambda."
  value       = module.secrets.api_secret_name
}

output "agent_secret_name" {
  description = "Secrets Manager secret name for the agent. EC2 user-data fetches this at boot."
  value       = module.secrets.agent_secret_name
}

output "lambda_exec_role_arn" {
  description = "Role the API Lambda will assume."
  value       = module.iam.lambda_exec_role_arn
}

output "agent_ec2_instance_profile_name" {
  description = "Instance profile to attach to the EC2 agent."
  value       = module.iam.agent_ec2_instance_profile_name
}

# ── API path outputs ──────────────────────────────────────────────────────────

output "api_url" {
  description = "Public API base URL. Use as API_BASE_URL in the mobile app."
  value       = module.api_gateway.api_endpoint
}

output "api_lambda_function_name" {
  description = "Lambda function name for CLI updates / log queries."
  value       = module.lambda_api.function_name
}

output "api_log_group" {
  description = "CloudWatch Logs group for the API Lambda."
  value       = module.lambda_api.log_group_name
}

# ── Upstash outputs ───────────────────────────────────────────────────────────

output "upstash_endpoint" {
  description = "Upstash Redis endpoint (hostname only)."
  value       = module.upstash.endpoint
}

output "upstash_redis_url" {
  description = "Full rediss:// URL. Sensitive — used only by app via Secrets Manager."
  value       = module.upstash.redis_url
  sensitive   = true
}
