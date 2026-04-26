terraform {
  backend "s3" {
    bucket         = "nexus-aec-tfstate-843792057554"
    key            = "envs/prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "nexus-aec-tfstate-locks"
    encrypt        = true
    profile        = "nexusAEC-prod"
  }
}
