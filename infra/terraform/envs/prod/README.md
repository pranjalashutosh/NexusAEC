# envs/prod

Production environment. Composes `../../modules` into a complete deployment.

## Prerequisites

1. Bootstrap stack applied (`../../bootstrap` — creates the S3 backend).
2. AWS profile `nexusAEC-prod` configured with admin permissions.
3. Upstash account created (sign up at https://console.upstash.com/).
4. (Optional) Custom domain registered.

## First-time setup

```bash
# 1. Copy and fill in the tfvars file
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars   # fill in upstash_*, all *_api_key/*_secret, etc.

# 2. Initialize (downloads providers, configures S3 backend)
terraform init

# 3. Plan and apply
terraform plan
terraform apply
```

`terraform.tfvars` is gitignored and must never be committed.

## What gets provisioned

| Module           | Resources                                                       |
| ---------------- | --------------------------------------------------------------- |
| `iam`            | Lambda execution role, EC2 instance profile + roles            |
| `secrets`        | AWS Secrets Manager entries for all app secrets                 |
| `ecr`            | ECR repository for the agent Docker image                       |
| `lambda-api`     | Lambda function (zip-based) running the Fastify API             |
| `api-gateway`    | HTTP API Gateway + optional custom domain + ACM cert            |
| `upstash`        | Upstash Redis database                                          |
| `ec2-agent`      | EC2 t3.small for the LiveKit voice agent + CloudWatch agent     |
| `route53`        | (optional) DNS records for custom domain                        |

## Updating secrets

Don't edit Secrets Manager values via the AWS Console — the next `terraform apply`
will overwrite them with the values in `terraform.tfvars`. Update `terraform.tfvars`
and run `terraform apply` instead. (Or, set the secret value to `null` in
Terraform to take it out of management.)
