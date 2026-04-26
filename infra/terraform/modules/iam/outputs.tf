output "lambda_exec_role_arn" {
  description = "ARN of the Lambda execution role. Pass to aws_lambda_function.role."
  value       = aws_iam_role.lambda_exec.arn
}

output "lambda_exec_role_name" {
  description = "Name of the Lambda execution role."
  value       = aws_iam_role.lambda_exec.name
}

output "agent_ec2_role_arn" {
  description = "ARN of the EC2 agent role."
  value       = aws_iam_role.agent_ec2.arn
}

output "agent_ec2_instance_profile_name" {
  description = "Name of the EC2 instance profile. Pass to aws_instance.iam_instance_profile."
  value       = aws_iam_instance_profile.agent_ec2.name
}

output "agent_ec2_instance_profile_arn" {
  description = "ARN of the EC2 instance profile."
  value       = aws_iam_instance_profile.agent_ec2.arn
}
