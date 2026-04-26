variable "aws_region" {
  description = "AWS region for state backend resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name to use for authentication."
  type        = string
  default     = "nexusAEC-prod"
}

variable "aws_account_id" {
  description = "AWS account ID. Used to make the state bucket name globally unique."
  type        = string
  default     = "843792057554"
}

variable "state_bucket_name_override" {
  description = "Optional override for the state bucket name. Default: nexus-aec-tfstate-<account-id>."
  type        = string
  default     = null
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locks."
  type        = string
  default     = "nexus-aec-tfstate-locks"
}
