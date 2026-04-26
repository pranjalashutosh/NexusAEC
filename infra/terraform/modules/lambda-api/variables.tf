variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "function_name" {
  description = "Lambda function name. Default: <name_prefix>-api."
  type        = string
  default     = null
}

variable "lambda_role_arn" {
  description = "ARN of the IAM role the Lambda assumes (from modules/iam)."
  type        = string
}

variable "package_path" {
  description = "Path to the built Lambda zip. Build with infra/terraform/scripts/build-api-lambda.sh."
  type        = string
}

variable "handler" {
  description = "Lambda handler. esbuild bundles to lambda.cjs which exports `handler`."
  type        = string
  default     = "lambda.handler"
}

variable "runtime" {
  description = "Lambda Node.js runtime."
  type        = string
  default     = "nodejs20.x"
}

variable "memory_size_mb" {
  description = "Lambda memory in MB. CPU scales linearly with memory."
  type        = number
  default     = 512
}

variable "timeout_seconds" {
  description = "Lambda execution timeout. Max 30 for API Gateway HTTP API integrations."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda. 30 = balance cost vs forensics."
  type        = number
  default     = 30
}

variable "secret_name" {
  description = "Secrets Manager secret name. Lambda fetches at boot via SECRET_NAME env var."
  type        = string
}

variable "extra_environment" {
  description = "Additional plaintext env vars for the Lambda (NOT secrets — use Secrets Manager for those)."
  type        = map(string)
  default     = {}
}
