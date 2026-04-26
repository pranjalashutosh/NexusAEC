output "api_secret_arn" {
  description = "ARN of the API service's Secrets Manager entry. Used by the Lambda IAM policy."
  value       = aws_secretsmanager_secret.api.arn
}

output "api_secret_name" {
  description = "Name of the API secret. Set as SECRET_NAME env var on the Lambda; app fetches at boot."
  value       = aws_secretsmanager_secret.api.name
}

output "agent_secret_arn" {
  description = "ARN of the agent service's Secrets Manager entry. Used by the EC2 IAM policy."
  value       = aws_secretsmanager_secret.agent.arn
}

output "agent_secret_name" {
  description = "Name of the agent secret. EC2 user-data script fetches and writes to /etc/nexus/.env."
  value       = aws_secretsmanager_secret.agent.name
}

output "jwt_secret_value" {
  description = "Auto-generated JWT signing secret. Sensitive — only use for local debugging."
  value       = random_password.jwt_secret.result
  sensitive   = true
}

output "token_encryption_key_value" {
  description = "Auto-generated token encryption key. Sensitive — only use for local debugging."
  value       = random_password.token_encryption_key.result
  sensitive   = true
}
