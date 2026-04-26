variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "repository_name" {
  description = "ECR repository name. Default: <name_prefix>-agent."
  type        = string
  default     = null
}

variable "keep_image_count" {
  description = "Number of tagged images to retain. Older tagged images are expired."
  type        = number
  default     = 10
}

variable "untagged_image_expiry_days" {
  description = "Days before untagged images are deleted."
  type        = number
  default     = 7
}

variable "image_scanning_on_push" {
  description = "Run a basic vulnerability scan on every image push."
  type        = bool
  default     = true
}
