output "repository_arn" {
  description = "ARN of the ECR repository. Used by IAM policies to scope ECR pull permissions."
  value       = aws_ecr_repository.agent.arn
}

output "repository_url" {
  description = "URL of the ECR repository (use for `docker tag` / `docker push`)."
  value       = aws_ecr_repository.agent.repository_url
}

output "repository_name" {
  description = "Name of the ECR repository."
  value       = aws_ecr_repository.agent.name
}
