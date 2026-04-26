output "api_id" {
  description = "API Gateway HTTP API ID."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Default invoke URL (https://<api-id>.execute-api.<region>.amazonaws.com)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_arn" {
  description = "API Gateway ARN."
  value       = aws_apigatewayv2_api.this.arn
}

output "execution_arn" {
  description = "Execution ARN — used by lambda permissions."
  value       = aws_apigatewayv2_api.this.execution_arn
}
