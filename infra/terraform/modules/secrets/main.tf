terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Auto-generated secrets — never appear in tfvars or source.
#
# JWT_SECRET signs auth tokens. CLAUDE.md notes TOKEN_ENCRYPTION_KEY falls back
# to JWT_SECRET if unset, but we generate a separate one for hygiene — rotating
# JWT_SECRET should not invalidate at-rest token encryption.
# ──────────────────────────────────────────────────────────────────────────────

resource "random_password" "jwt_secret" {
  length      = 64
  special     = false
  min_lower   = 8
  min_upper   = 8
  min_numeric = 8
}

resource "random_password" "token_encryption_key" {
  length      = 64
  special     = false
  min_lower   = 8
  min_upper   = 8
  min_numeric = 8
}

# ──────────────────────────────────────────────────────────────────────────────
# Secrets Manager — one secret per service, JSON payload.
#
# Keys inside the JSON match the env-var names the app expects, so the runtime
# can fetch the secret once and inject the parsed JSON into process.env.
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "api" {
  name                    = "nexus-aec/${var.environment}/api"
  description             = "Secrets for the NexusAEC API Lambda (${var.environment})."
  recovery_window_in_days = var.recovery_window_days
}

resource "aws_secretsmanager_secret_version" "api" {
  secret_id = aws_secretsmanager_secret.api.id
  secret_string = jsonencode({
    OPENAI_API_KEY            = var.openai_api_key
    SUPABASE_URL              = var.supabase_url
    SUPABASE_SERVICE_ROLE_KEY = var.supabase_service_role_key
    LIVEKIT_URL               = var.livekit_url
    LIVEKIT_API_KEY           = var.livekit_api_key
    LIVEKIT_API_SECRET        = var.livekit_api_secret
    REDIS_URL                 = var.redis_url
    JWT_SECRET                = random_password.jwt_secret.result
    TOKEN_ENCRYPTION_KEY      = random_password.token_encryption_key.result
    GOOGLE_CLIENT_ID          = var.google_client_id
    GOOGLE_CLIENT_SECRET      = var.google_client_secret
    MICROSOFT_CLIENT_ID       = var.microsoft_client_id
    MICROSOFT_CLIENT_SECRET   = var.microsoft_client_secret
  })
}

resource "aws_secretsmanager_secret" "agent" {
  name                    = "nexus-aec/${var.environment}/agent"
  description             = "Secrets for the NexusAEC voice agent EC2 (${var.environment})."
  recovery_window_in_days = var.recovery_window_days
}

resource "aws_secretsmanager_secret_version" "agent" {
  secret_id = aws_secretsmanager_secret.agent.id
  secret_string = jsonencode({
    OPENAI_API_KEY            = var.openai_api_key
    SUPABASE_URL              = var.supabase_url
    SUPABASE_SERVICE_ROLE_KEY = var.supabase_service_role_key
    LIVEKIT_URL               = var.livekit_url
    LIVEKIT_API_KEY           = var.livekit_api_key
    LIVEKIT_API_SECRET        = var.livekit_api_secret
    REDIS_URL                 = var.redis_url
    DEEPGRAM_API_KEY          = var.deepgram_api_key
    ELEVENLABS_API_KEY        = var.elevenlabs_api_key
    ELEVENLABS_VOICE_ID       = var.elevenlabs_voice_id
  })
}
