output "instance_id" {
  description = "EC2 instance ID. Connect with: aws ssm start-session --target <this>"
  value       = aws_instance.agent.id
}

output "private_ip" {
  description = "Private IP of the agent instance."
  value       = aws_instance.agent.private_ip
}

output "public_ip" {
  description = "Public IP. If allocate_eip=true, this is the EIP (stable across restarts)."
  value       = var.allocate_eip ? aws_eip.agent[0].public_ip : aws_instance.agent.public_ip
}

output "log_group_name" {
  description = "CloudWatch Logs group for agent container output."
  value       = aws_cloudwatch_log_group.agent.name
}

output "ami_id" {
  description = "AMI ID currently in use."
  value       = data.aws_ami.amazon_linux_2023.id
}
