variable "name_prefix" {
  description = "Resource name prefix (e.g. 'nexus-aec-prod')."
  type        = string
}

variable "environment" {
  description = "Environment name (used in secret path: nexus-aec/<env>/<service>)."
  type        = string
}

# ── Secrets shared between API and Agent ──────────────────────────────────────

variable "openai_api_key" {
  description = "OpenAI API key."
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL."
  type        = string
}

variable "supabase_service_role_key" {
  description = "Supabase service role key."
  type        = string
  sensitive   = true
}

variable "livekit_url" {
  description = "LiveKit Cloud project URL (wss://...)."
  type        = string
}

variable "livekit_api_key" {
  description = "LiveKit Cloud API key."
  type        = string
  sensitive   = true
}

variable "livekit_api_secret" {
  description = "LiveKit Cloud API secret (signing + webhook HMAC)."
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Upstash Redis connection URL (rediss://...). Wired in by the upstash module output."
  type        = string
  sensitive   = true
  default     = ""
}

# ── API-only secrets ──────────────────────────────────────────────────────────

variable "google_client_id" {
  description = "Google OAuth client ID."
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
}

variable "microsoft_client_id" {
  description = "Microsoft OAuth client ID."
  type        = string
  default     = ""
}

variable "microsoft_client_secret" {
  description = "Microsoft OAuth client secret."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Agent-only secrets ────────────────────────────────────────────────────────

variable "deepgram_api_key" {
  description = "Deepgram STT API key."
  type        = string
  sensitive   = true
}

variable "elevenlabs_api_key" {
  description = "ElevenLabs TTS API key."
  type        = string
  sensitive   = true
}

variable "elevenlabs_voice_id" {
  description = "ElevenLabs voice ID."
  type        = string
}

# ── Recovery window ───────────────────────────────────────────────────────────

variable "recovery_window_days" {
  description = "Days to retain deleted secrets for recovery. 0 = immediate delete (use 0 in dev only)."
  type        = number
  default     = 7
}
