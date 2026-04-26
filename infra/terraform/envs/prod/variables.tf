# ──────────────────────────────────────────────────────────────────────────────
# AWS / environment basics
# ──────────────────────────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for all production resources."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile name to use for authentication."
  type        = string
  default     = "nexusAEC-prod"
}

variable "aws_account_id" {
  description = "AWS account ID. Used for ARN construction and naming."
  type        = string
  default     = "843792057554"
}

variable "environment" {
  description = "Environment name (used in resource naming and tags)."
  type        = string
  default     = "prod"
}

variable "name_prefix" {
  description = "Prefix applied to all resource names. Default: nexus-aec-<env>."
  type        = string
  default     = null
}

# ──────────────────────────────────────────────────────────────────────────────
# Upstash (serverless Redis)
# ──────────────────────────────────────────────────────────────────────────────

variable "upstash_email" {
  description = "Upstash account email. Get from https://console.upstash.com/account/api"
  type        = string
  sensitive   = true
}

variable "upstash_api_key" {
  description = "Upstash management API key. Get from https://console.upstash.com/account/api"
  type        = string
  sensitive   = true
}

variable "upstash_redis_region" {
  description = "Upstash Redis region. Use 'us-east-1' to colocate with Lambda + EC2."
  type        = string
  default     = "us-east-1"
}

# ──────────────────────────────────────────────────────────────────────────────
# Custom domain (optional — leave null to use API Gateway's default URL)
# ──────────────────────────────────────────────────────────────────────────────

variable "api_custom_domain" {
  description = "Custom domain for the API (e.g. 'api.nexusaec.com'). Set to null to skip."
  type        = string
  default     = null
}

variable "route53_zone_id" {
  description = "Existing Route 53 hosted zone ID for api_custom_domain. Required if api_custom_domain is set AND DNS is in Route 53. Leave null for external DNS — ACM validation records will be exposed as outputs."
  type        = string
  default     = null
}

# ──────────────────────────────────────────────────────────────────────────────
# App secrets (passed to Secrets Manager — NEVER commit real values)
# ──────────────────────────────────────────────────────────────────────────────

variable "openai_api_key" {
  description = "OpenAI API key (used by API for briefing pre-compute, by agent for GPT-4o)."
  type        = string
  sensitive   = true
}

variable "deepgram_api_key" {
  description = "Deepgram API key (agent only — STT)."
  type        = string
  sensitive   = true
}

variable "elevenlabs_api_key" {
  description = "ElevenLabs API key (agent only — TTS)."
  type        = string
  sensitive   = true
}

variable "elevenlabs_voice_id" {
  description = "ElevenLabs voice ID."
  type        = string
}

variable "livekit_url" {
  description = "LiveKit Cloud project URL (e.g. wss://your-project.livekit.cloud)."
  type        = string
}

variable "livekit_api_key" {
  description = "LiveKit Cloud API key."
  type        = string
  sensitive   = true
}

variable "livekit_api_secret" {
  description = "LiveKit Cloud API secret. Used for token signing AND webhook HMAC verification."
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL (https://<project>.supabase.co)."
  type        = string
}

variable "supabase_service_role_key" {
  description = "Supabase service role key. NEVER expose to client."
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID (Gmail integration)."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
}

variable "microsoft_client_id" {
  description = "Microsoft OAuth client ID (Outlook integration)."
  type        = string
  default     = ""
}

variable "microsoft_client_secret" {
  description = "Microsoft OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

# ──────────────────────────────────────────────────────────────────────────────
# Computed
# ──────────────────────────────────────────────────────────────────────────────

locals {
  name_prefix = coalesce(var.name_prefix, "nexus-aec-${var.environment}")
}
