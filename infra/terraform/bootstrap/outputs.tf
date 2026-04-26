output "state_bucket_name" {
  description = "S3 bucket holding Terraform state for all NexusAEC stacks."
  value       = aws_s3_bucket.tfstate.id
}

output "state_bucket_region" {
  description = "AWS region of the state bucket."
  value       = var.aws_region
}

output "lock_table_name" {
  description = "DynamoDB table used for Terraform state locking."
  value       = aws_dynamodb_table.tfstate_locks.name
}

output "backend_config_snippet" {
  description = "Drop this into envs/<env>/backend.tf (already wired in envs/prod/backend.tf)."
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.tfstate.id}"
        key            = "envs/<env-name>/terraform.tfstate"
        region         = "${var.aws_region}"
        dynamodb_table = "${aws_dynamodb_table.tfstate_locks.name}"
        encrypt        = true
        profile        = "${var.aws_profile}"
      }
    }
  EOT
}
