variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "database_name" {
  description = "Upstash Redis database name. Default: <name_prefix>-redis."
  type        = string
  default     = null
}

variable "region" {
  description = "Upstash primary region. Mapped to upstash_redis_database.primary_region. Use 'us-east-1' to colocate with Lambda + EC2. (Old 'regional' DB API is deprecated; this creates a Global-class DB with a single primary region.)"
  type        = string
  default     = "us-east-1"
}

variable "tls_enabled" {
  description = "Enable TLS (rediss://). Always true for production."
  type        = bool
  default     = true
}
