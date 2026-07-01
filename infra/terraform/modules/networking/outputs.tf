output "vpc_id" {
  description = "Default VPC ID."
  value       = data.aws_vpc.default.id
}

output "subnet_ids" {
  description = "All default subnets in the default VPC."
  value       = data.aws_subnets.default.ids
}

output "first_subnet_id" {
  description = "The first default subnet — used for single-AZ deployments."
  value       = data.aws_subnets.default.ids[0]
}

output "agent_security_group_id" {
  description = "Security group for the agent EC2 (egress only)."
  value       = aws_security_group.agent.id
}
