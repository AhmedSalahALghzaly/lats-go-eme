# Al-Ghazaly Auto Parts - DocumentDB (MongoDB-compatible) Configuration
# Creates a managed MongoDB-compatible database cluster

# Security group for DocumentDB
resource "aws_security_group" "documentdb" {
  name        = "${local.cluster_name}-documentdb-sg"
  description = "Security group for DocumentDB cluster"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "MongoDB from EKS nodes"
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-documentdb-sg"
  })
}

# DocumentDB subnet group
resource "aws_docdb_subnet_group" "main" {
  name       = "${local.cluster_name}-docdb-subnet"
  subnet_ids = module.vpc.private_subnets

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-docdb-subnet"
  })
}

# DocumentDB parameter group
resource "aws_docdb_cluster_parameter_group" "main" {
  name        = "${local.cluster_name}-docdb-params"
  family      = "docdb5.0"
  description = "DocumentDB cluster parameter group for Al-Ghazaly"

  parameter {
    name  = "tls"
    value = "enabled"
  }

  parameter {
    name  = "audit_logs"
    value = var.enable_monitoring ? "enabled" : "disabled"
  }

  tags = local.common_tags
}

# DocumentDB cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier = "${local.cluster_name}-docdb"
  engine             = "docdb"
  engine_version     = "5.0.0"

  master_username = var.mongodb_master_username
  master_password = var.mongodb_master_password

  db_subnet_group_name            = aws_docdb_subnet_group.main.name
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  vpc_security_group_ids          = [aws_security_group.documentdb.id]

  # Backup configuration
  backup_retention_period = var.environment == "production" ? 7 : 1
  preferred_backup_window = "03:00-04:00"

  # Maintenance
  preferred_maintenance_window = "sun:04:00-sun:05:00"

  # Encryption
  storage_encrypted = true
  kms_key_id        = aws_kms_key.documentdb.arn

  # Deletion protection
  deletion_protection = var.environment == "production"
  skip_final_snapshot = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.cluster_name}-docdb-final" : null

  # Logging
  enabled_cloudwatch_logs_exports = var.enable_monitoring ? ["audit", "profiler"] : []

  tags = local.common_tags
}

# DocumentDB instances
resource "aws_docdb_cluster_instance" "main" {
  count = var.environment == "production" ? 2 : 1

  identifier         = "${local.cluster_name}-docdb-${count.index + 1}"
  cluster_identifier = aws_docdb_cluster.main.id
  instance_class     = var.mongodb_instance_class

  # Enable performance insights
  enable_performance_insights = var.enable_monitoring

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-docdb-${count.index + 1}"
  })
}

# KMS key for DocumentDB encryption
resource "aws_kms_key" "documentdb" {
  description             = "KMS key for DocumentDB encryption - ${local.cluster_name}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-docdb-kms"
  })
}

resource "aws_kms_alias" "documentdb" {
  name          = "alias/${local.cluster_name}-docdb"
  target_key_id = aws_kms_key.documentdb.key_id
}

# Store connection string in Secrets Manager
resource "aws_secretsmanager_secret" "documentdb" {
  name        = "${local.cluster_name}/documentdb/connection"
  description = "DocumentDB connection string for ${local.cluster_name}"

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "documentdb" {
  secret_id = aws_secretsmanager_secret.documentdb.id
  secret_string = jsonencode({
    host     = aws_docdb_cluster.main.endpoint
    port     = 27017
    username = var.mongodb_master_username
    password = var.mongodb_master_password
    connection_string = "mongodb://${var.mongodb_master_username}:${var.mongodb_master_password}@${aws_docdb_cluster.main.endpoint}:27017/alghazaly_autoparts?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false"
  })
}
