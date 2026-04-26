terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

locals {
  function_name = coalesce(var.function_name, "${var.name_prefix}-api")
}

# CloudWatch Logs group is created explicitly (not auto-created by Lambda) so we
# control retention. Without this, Lambda would create the group with infinite
# retention on first invocation — costly and a compliance concern.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = local.function_name
  role          = var.lambda_role_arn
  runtime       = var.runtime
  handler       = var.handler

  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)

  memory_size = var.memory_size_mb
  timeout     = var.timeout_seconds

  environment {
    variables = merge({
      NODE_ENV    = "production"
      LOG_LEVEL   = "info"
      SECRET_NAME = var.secret_name
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }, var.extra_environment)
  }

  # Ensure the log group exists before the function (Lambda would auto-create
  # otherwise with infinite retention).
  depends_on = [aws_cloudwatch_log_group.api]
}
