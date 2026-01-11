# Al-Ghazaly Auto Parts - Terraform Main Configuration
# Infrastructure as Code for AWS deployment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  # Remote state storage (recommended for team collaboration)
  backend "s3" {
    bucket         = "alghazaly-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "me-south-1"  # Bahrain region for Middle East
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

# AWS Provider
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "alghazaly-auto-parts"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Local values
locals {
  cluster_name = "alghazaly-${var.environment}"
  common_tags = {
    Project     = "alghazaly-auto-parts"
    Environment = var.environment
  }
}
