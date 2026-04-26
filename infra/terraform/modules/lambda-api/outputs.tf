output "function_name" {
  description = "Lambda function name (used by API Gateway lambda_permission)."
  value       = aws_lambda_function.api.function_name
}

output "function_arn" {
  description = "Lambda function ARN."
  value       = aws_lambda_function.api.arn
}

output "invoke_arn" {
  description = "Lambda invoke ARN — pass to API Gateway integration_uri."
  value       = aws_lambda_function.api.invoke_arn
}

output "log_group_name" {
  description = "CloudWatch Logs group name."
  value       = aws_cloudwatch_log_group.api.name
}
