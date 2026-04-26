terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

# ──────────────────────────────────────────────────────────────────────────────
# Lambda execution role — used by the API Lambda function.
#
# Permissions:
#   • CloudWatch Logs (write) — via AWSLambdaBasicExecutionRole
#   • Secrets Manager — read api_secret_arn ONLY
# ──────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${var.name_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [var.api_secret_arn]
  }
}

resource "aws_iam_policy" "lambda_secrets" {
  name        = "${var.name_prefix}-lambda-secrets-read"
  description = "Allow Lambda to read its own Secrets Manager entry."
  policy      = data.aws_iam_policy_document.lambda_secrets.json
}

resource "aws_iam_role_policy_attachment" "lambda_secrets" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_secrets.arn
}

# ──────────────────────────────────────────────────────────────────────────────
# EC2 instance role — used by the LiveKit voice agent EC2 instance.
#
# Permissions:
#   • ECR (pull) — agent image only
#   • Secrets Manager — read agent_secret_arn only
#   • CloudWatch Logs (write) — for the CloudWatch agent on the instance
#   • CloudWatch metrics (PutMetricData) — for the CloudWatch agent
# ──────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agent_ec2" {
  name               = "${var.name_prefix}-agent-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# ECR pull — scoped to the single agent repo, not the AWS-managed
# AmazonEC2ContainerRegistryReadOnly (which grants account-wide).
data "aws_iam_policy_document" "ec2_ecr" {
  statement {
    sid       = "ECRTokenForLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # GetAuthorizationToken does not support resource-level perms
  }

  statement {
    sid = "ECRPullAgentImage"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [var.ecr_repository_arn]
  }
}

resource "aws_iam_policy" "ec2_ecr" {
  name        = "${var.name_prefix}-agent-ecr-pull"
  description = "Allow EC2 to pull the agent Docker image from ECR."
  policy      = data.aws_iam_policy_document.ec2_ecr.json
}

resource "aws_iam_role_policy_attachment" "ec2_ecr" {
  role       = aws_iam_role.agent_ec2.name
  policy_arn = aws_iam_policy.ec2_ecr.arn
}

# Secrets Manager — agent secret only
data "aws_iam_policy_document" "ec2_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [var.agent_secret_arn]
  }
}

resource "aws_iam_policy" "ec2_secrets" {
  name        = "${var.name_prefix}-agent-secrets-read"
  description = "Allow EC2 agent to read its own Secrets Manager entry."
  policy      = data.aws_iam_policy_document.ec2_secrets.json
}

resource "aws_iam_role_policy_attachment" "ec2_secrets" {
  role       = aws_iam_role.agent_ec2.name
  policy_arn = aws_iam_policy.ec2_secrets.arn
}

# CloudWatch agent — uses the AWS-managed policy. Includes log writes,
# PutMetricData, ssm:GetParameter (for CW agent config), etc.
resource "aws_iam_role_policy_attachment" "ec2_cw_agent" {
  role       = aws_iam_role.agent_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

# SSM access — lets you connect via Session Manager instead of SSH (no inbound
# port 22 needed). Highly recommended for security.
resource "aws_iam_role_policy_attachment" "ec2_ssm" {
  role       = aws_iam_role.agent_ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "agent_ec2" {
  name = "${var.name_prefix}-agent-ec2"
  role = aws_iam_role.agent_ec2.name
}
