variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "lambda_function_name" {
  description = "Lambda function name (used by aws_lambda_permission)."
  type        = string
}

variable "lambda_invoke_arn" {
  description = "Lambda invoke ARN (from modules/lambda-api)."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Origins allowed by CORS. Mobile uses '*' (no origin); web origins go here once a web client exists."
  type        = list(string)
  default     = ["*"]
}

variable "throttle_burst_limit" {
  description = "Max concurrent requests above the rate limit. Defense against bursts."
  type        = number
  default     = 500
}

variable "throttle_rate_limit" {
  description = "Steady-state rate cap (req/sec)."
  type        = number
  default     = 1000
}

variable "log_retention_days" {
  description = "CloudWatch retention for API Gateway access logs."
  type        = number
  default     = 30
}
