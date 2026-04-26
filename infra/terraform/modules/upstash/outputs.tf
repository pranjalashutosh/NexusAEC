output "database_id" {
  description = "Upstash database ID."
  value       = upstash_redis_database.this.database_id
}

output "endpoint" {
  description = "Database hostname."
  value       = upstash_redis_database.this.endpoint
}

output "port" {
  description = "Database port (6379 for TLS)."
  value       = upstash_redis_database.this.port
}

output "redis_url" {
  description = "Full rediss:// connection URL with password. Used by app config."
  value       = "rediss://default:${upstash_redis_database.this.password}@${upstash_redis_database.this.endpoint}:${upstash_redis_database.this.port}"
  sensitive   = true
}
