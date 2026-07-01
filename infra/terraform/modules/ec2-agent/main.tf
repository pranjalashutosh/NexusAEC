terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

locals {
  log_group_name = coalesce(var.log_group_name, "/aws/ec2/${var.name_prefix}-agent")
  instance_name  = "${var.name_prefix}-agent"
}

# ──────────────────────────────────────────────────────────────────────────────
# Latest Amazon Linux 2023 AMI for x86_64.
# t3.small is x86_64. (For arm64 → t4g.* + change AMI filter accordingly.)
# ──────────────────────────────────────────────────────────────────────────────
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Container log group. The awslogs Docker driver writes here directly.
# Created BEFORE the instance so the driver doesn't need create-group permission.
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "agent" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days
}

# ──────────────────────────────────────────────────────────────────────────────
# User-data — bootstrap script rendered from user-data.sh.tftpl.
# ──────────────────────────────────────────────────────────────────────────────
locals {
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    aws_region     = var.aws_region
    secret_name    = var.secret_name
    ecr_registry   = var.ecr_registry
    ecr_repository = var.ecr_repository
    image_tag      = var.image_tag
    log_group_name = aws_cloudwatch_log_group.agent.name
  })
}

resource "aws_instance" "agent" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [var.security_group_id]
  iam_instance_profile   = var.instance_profile_name
  user_data              = local.user_data

  # Replace instance when user-data changes — simpler than in-place update,
  # ensures every change goes through a clean boot.
  user_data_replace_on_change = true

  metadata_options {
    http_tokens                 = "required" # IMDSv2 only — blocks SSRF
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2 # allow Docker containers to read IMDS
  }

  root_block_device {
    volume_size           = var.root_volume_gb
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  # Don't replace just because the AMI rolled forward.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = {
    Name = local.instance_name
  }

  depends_on = [aws_cloudwatch_log_group.agent]
}

# ──────────────────────────────────────────────────────────────────────────────
# Elastic IP — public IP that survives instance restarts. Useful so LiveKit
# Cloud's outbound webhook target stays stable.
# ──────────────────────────────────────────────────────────────────────────────
resource "aws_eip" "agent" {
  count    = var.allocate_eip ? 1 : 0
  instance = aws_instance.agent.id
  domain   = "vpc"

  tags = {
    Name = "${local.instance_name}-eip"
  }
}
