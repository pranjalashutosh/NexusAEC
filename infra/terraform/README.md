# NexusAEC Terraform

Infrastructure-as-code for NexusAEC's AWS deployment, managed by Terraform.
Reference: `docs/DEPLOYMENT_ROADMAP.md` Phase 2.

## Layout

```
bootstrap/        — One-shot: provisions the S3 + DynamoDB state backend.
                    Uses local state. Apply this FIRST, then never touch again.
envs/
  prod/           — Production environment. Uses the bootstrap-created S3 backend.
modules/          — Reusable building blocks (composed by env stacks).
  iam/            — Lambda execution role + EC2 instance profile.
  ecr/            — ECR repository for the agent Docker image.
  secrets/        — Secrets Manager entries for app secrets.
  lambda-api/     — Lambda function for the API (zip deploy).
  api-gateway/    — HTTP API Gateway with optional custom domain.
  upstash/        — Upstash Redis database via Upstash provider.
  ec2-agent/      — EC2 t3.small for the LiveKit voice agent.
  networking/     — Default VPC lookup + security groups.
  route53/        — Optional Route 53 zone + records for custom domain.
```

## Prerequisites

- Terraform >= 1.6 (`brew install terraform` or `tfenv`)
- AWS CLI configured with profile `nexusAEC-prod` (account `843792057554`, region `us-east-1`)
- Upstash account (sign up at upstash.com) — needed only when applying `envs/prod`
- A domain name (optional for v1 — can use API Gateway's default URL)

## First-time setup

### 1. Apply bootstrap (one-shot)

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

This creates:
- S3 bucket `nexus-aec-tfstate-843792057554` (versioned, encrypted, public access blocked)
- DynamoDB table `nexus-aec-tfstate-locks` (for state locking)

After apply, the bootstrap state lives at `bootstrap/terraform.tfstate` (local).
**Commit nothing from this directory** — `.gitignore` covers it.

### 2. Apply prod environment

```bash
cd infra/terraform/envs/prod
cp terraform.tfvars.example terraform.tfvars
# Fill in: upstash_email, upstash_api_key, optional custom_domain
terraform init       # downloads providers, configures S3 backend
terraform plan
terraform apply
```

## Conventions

- Region: `us-east-1` (per roadmap).
- All resources tagged `Project = "nexus-aec"` and `ManagedBy = "terraform"`.
- Secrets are stored in AWS Secrets Manager, NEVER in tfvars or state.
- Tfvars files (`*.tfvars`) are gitignored. Only `*.tfvars.example` is committed.
