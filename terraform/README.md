# Al-Ghazaly Auto Parts - Terraform Infrastructure

This directory contains Terraform configurations for deploying the Al-Ghazaly Auto Parts infrastructure on AWS.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud (me-south-1)                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                              VPC (10.0.0.0/16)                              │  │
│  │  ┌─────────────────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │     Public Subnets          │  │     Private Subnets         │  │  │
│  │  │  ┌───────────────────────┐ │  │  ┌───────────────────────┐ │  │  │
│  │  │  │    NLB (Ingress)      │ │  │  │    EKS Nodes        │ │  │  │
│  │  │  │    NAT Gateways       │ │  │  │    DocumentDB       │ │  │  │
│  │  │  └───────────────────────┘ │  │  └───────────────────────┘ │  │  │
│  │  └─────────────────────────────┘  └─────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐   │
│  │      ECR      │  │ Secrets Mgr   │  │      KMS      │  │  CloudWatch  │   │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.5.0
3. **kubectl** for Kubernetes cluster management
4. **helm** for installing Kubernetes addons

## Quick Start

### 1. Initialize Terraform

```bash
cd terraform

# Create S3 bucket for state (first time only)
aws s3 mb s3://alghazaly-terraform-state --region me-south-1
aws dynamodb create-table \
    --table-name terraform-state-lock \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region me-south-1

# Initialize Terraform
terraform init
```

### 2. Configure Variables

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
```

### 3. Plan and Apply

```bash
# Review changes
terraform plan

# Apply (requires confirmation)
terraform apply
```

### 4. Configure kubectl

```bash
# Get the kubectl configuration command from output
terraform output configure_kubectl

# Run the command
aws eks update-kubeconfig --region me-south-1 --name alghazaly-production
```

### 5. Deploy Application

```bash
# Apply Kubernetes manifests
kubectl apply -k ../k8s/
```

## Components Created

| Component | Description |
|-----------|-------------|
| **VPC** | Multi-AZ VPC with public/private subnets |
| **EKS** | Managed Kubernetes cluster v1.29 |
| **Node Groups** | On-demand + Spot instance groups |
| **DocumentDB** | MongoDB-compatible managed database |
| **ECR** | Container registries for backend/frontend |
| **Load Balancer** | AWS NLB via ingress controller |
| **Cert Manager** | Automatic TLS certificates |
| **Secrets Manager** | Secure credential storage |

## Cost Estimation

| Resource | Monthly Cost (approx.) |
|----------|------------------------|
| EKS Control Plane | $73 |
| EC2 Nodes (3x t3.medium) | $90 |
| DocumentDB (1 instance) | $60 |
| NAT Gateway | $32 + data |
| Load Balancer | $16 + data |
| ECR Storage | Variable |
| **Total (estimated)** | **~$300/month** |

## Environments

Create separate workspaces for each environment:

```bash
# Create staging environment
terraform workspace new staging
terraform apply -var="environment=staging"

# Switch back to production
terraform workspace select default
```

## Cleanup

```bash
# Destroy all resources (CAUTION!)
terraform destroy
```

## Security Features

- ✅ Private subnets for EKS nodes and database
- ✅ KMS encryption for ECR, DocumentDB, and secrets
- ✅ Network policies for pod-to-pod traffic
- ✅ TLS certificates via cert-manager
- ✅ Secrets stored in AWS Secrets Manager
- ✅ VPC endpoints for private AWS service access
- ✅ Security groups with minimal access rules

## Troubleshooting

### Pods can't pull images from ECR
```bash
kubectl create secret docker-registry ecr-secret \
    --docker-server=$AWS_ACCOUNT_ID.dkr.ecr.me-south-1.amazonaws.com \
    --docker-username=AWS \
    --docker-password=$(aws ecr get-login-password)
```

### DocumentDB connection issues
Ensure your EKS nodes can reach DocumentDB:
```bash
kubectl run -it --rm debug --image=mongo:7 -- mongosh "$CONNECTION_STRING"
```

## Support

For issues and questions, please contact the DevOps team.
