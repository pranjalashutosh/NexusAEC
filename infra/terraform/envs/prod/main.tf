# ──────────────────────────────────────────────────────────────────────────────
# envs/prod — production infrastructure
#
# Composes the modules in ../../modules into a complete prod environment.
# Built incrementally per DEPLOYMENT_ROADMAP.md Phase 2.
# ──────────────────────────────────────────────────────────────────────────────

# ── Upstash Redis ─────────────────────────────────────────────────────────────

module "upstash" {
  source = "../../modules/upstash"

  name_prefix = local.name_prefix
  region      = var.upstash_redis_region
}

# ── Foundation: secrets, ECR, IAM ─────────────────────────────────────────────

module "secrets" {
  source = "../../modules/secrets"

  name_prefix = local.name_prefix
  environment = var.environment

  openai_api_key            = var.openai_api_key
  supabase_url              = var.supabase_url
  supabase_service_role_key = var.supabase_service_role_key
  livekit_url               = var.livekit_url
  livekit_api_key           = var.livekit_api_key
  livekit_api_secret        = var.livekit_api_secret
  redis_url                 = module.upstash.redis_url

  google_client_id        = var.google_client_id
  google_client_secret    = var.google_client_secret
  microsoft_client_id     = var.microsoft_client_id
  microsoft_client_secret = var.microsoft_client_secret

  deepgram_api_key    = var.deepgram_api_key
  elevenlabs_api_key  = var.elevenlabs_api_key
  elevenlabs_voice_id = var.elevenlabs_voice_id
}

module "ecr" {
  source = "../../modules/ecr"

  name_prefix = local.name_prefix
}

module "iam" {
  source = "../../modules/iam"

  name_prefix        = local.name_prefix
  api_secret_arn     = module.secrets.api_secret_arn
  agent_secret_arn   = module.secrets.agent_secret_arn
  ecr_repository_arn = module.ecr.repository_arn
}

# ── API path: Lambda + API Gateway ────────────────────────────────────────────

module "lambda_api" {
  source = "../../modules/lambda-api"

  name_prefix     = local.name_prefix
  lambda_role_arn = module.iam.lambda_exec_role_arn
  package_path    = "${path.module}/../../builds/api-lambda.zip"
  secret_name     = module.secrets.api_secret_name

  # OAuth callback URLs are built from API_BASE_URL. Without this, the Lambda
  # falls back to http://localhost:3000 and Google redirects users into the void.
  extra_environment = {
    API_BASE_URL = var.api_base_url
  }
}

module "api_gateway" {
  source = "../../modules/api-gateway"

  name_prefix          = local.name_prefix
  lambda_function_name = module.lambda_api.function_name
  lambda_invoke_arn    = module.lambda_api.invoke_arn
}

# ── Agent path: networking + EC2 ──────────────────────────────────────────────

module "networking" {
  source = "../../modules/networking"

  name_prefix = local.name_prefix
}

module "ec2_agent" {
  source = "../../modules/ec2-agent"

  name_prefix           = local.name_prefix
  aws_region            = var.aws_region
  subnet_id             = module.networking.first_subnet_id
  security_group_id     = module.networking.agent_security_group_id
  instance_profile_name = module.iam.agent_ec2_instance_profile_name
  secret_name           = module.secrets.agent_secret_name
  ecr_registry          = "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  ecr_repository        = module.ecr.repository_name
}
