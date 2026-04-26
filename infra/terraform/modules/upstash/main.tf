terraform {
  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 1.5"
    }
  }
}

locals {
  database_name = coalesce(var.database_name, "${var.name_prefix}-redis")
}

resource "upstash_redis_database" "this" {
  database_name  = local.database_name
  region         = "global"      # required schema field; "global" enables the new DB type
  primary_region = var.region    # actual physical location (e.g. us-east-1)
  tls            = var.tls_enabled
}
