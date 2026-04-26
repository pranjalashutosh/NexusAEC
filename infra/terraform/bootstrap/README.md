# Bootstrap

One-shot stack that provisions the S3 bucket + DynamoDB table used as the
Terraform remote-state backend for every other stack in this repo.

This stack itself uses **local state** (chicken-and-egg: it can't store its
state in a bucket it hasn't created yet). Apply it once per AWS account, then
forget about it.

## Apply

```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

Expected output: an S3 bucket `nexus-aec-tfstate-<account-id>` and a DynamoDB
table `nexus-aec-tfstate-locks`, both in `us-east-1`.

## What it creates

| Resource              | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| S3 bucket             | Terraform state storage. Versioned + AES256 encrypted + public-blocked. |
| Lifecycle rule        | Expires non-current state versions after 90 days.                    |
| DynamoDB table        | State locking (prevents concurrent `terraform apply` from corrupting state). |

## Destroying

Don't, unless you're tearing down the entire AWS account. Destroying this stack
orphans the state of every other stack (they'll fail on `terraform init`).
If you must: empty the S3 bucket first (versioned buckets refuse to delete
non-empty), then `terraform destroy`.

## State file

The local state lives at `terraform.tfstate`. It's gitignored. Back it up
somewhere (1Password attachment, encrypted volume) — losing it means Terraform
forgets the bucket exists, and future `apply` runs would try to recreate it
(failing because S3 bucket names are globally unique).
