terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Use the account's default VPC and default subnets.
#
# At 2-10 users we don't need a dedicated VPC, NAT gateways, or private subnets.
# The agent has no inbound traffic (Session Manager via outbound, LiveKit
# dispatch via outbound) — the default VPC's public subnets are fine.
# Migrate to a dedicated VPC when adding multiple availability zones or
# private subnets becomes necessary (>50 users).
# ──────────────────────────────────────────────────────────────────────────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Security group for the agent EC2 instance.
#
# INGRESS: none. We use AWS Systems Manager Session Manager for shell access
# (outbound HTTPS to ssm.amazonaws.com) — no SSH port exposed.
#
# EGRESS: all. The agent connects outbound to:
#   • LiveKit Cloud (wss://*.livekit.cloud:443)
#   • Deepgram (wss://api.deepgram.com:443)
#   • ElevenLabs (https://api.elevenlabs.io:443)
#   • OpenAI (https://api.openai.com:443)
#   • Upstash Redis (rediss://*.upstash.io:6379)
#   • Supabase (https://*.supabase.co:443)
#   • ECR (https://*.ecr.us-east-1.amazonaws.com:443)
#   • Secrets Manager (https://secretsmanager.us-east-1.amazonaws.com:443)
#   • CloudWatch Logs (https://logs.us-east-1.amazonaws.com:443)
#   • SSM (https://ssm.us-east-1.amazonaws.com:443)
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_security_group" "agent" {
  name_prefix = "${var.name_prefix}-agent-"
  description = "LiveKit voice agent - egress only, no inbound (Session Manager for access)."
  vpc_id      = data.aws_vpc.default.id

  egress {
    description      = "All outbound (LiveKit, Deepgram, ElevenLabs, OpenAI, Redis, Supabase, ECR, SSM)"
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.name_prefix}-agent"
  }

  lifecycle {
    create_before_destroy = true
  }
}
