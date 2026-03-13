#!/bin/bash
# scripts/backup.sh
# -----------------------------------------------------------------------------
# Automated backup script for Sentinel Core
# Excludes the heavily partitioned `events` tables which should be handled
# via standard replication or S3 archiving in production environments.
# -----------------------------------------------------------------------------

set -e

BACKUP_DIR="/var/backups/sentinel_core"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
DB_USER=${POSTGRES_USER:-postgres}
DB_NAME=${POSTGRES_DB:-sentinel_core}
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$DATE.sql.gz"

# Ensure the backup directory exists
mkdir -p "$BACKUP_DIR"

echo "Starting database backup for $DB_NAME..."

# pg_dump with custom exclusions
# -T events* natively skips the parent partitioned table and all historic child partitions
pg_dump -U "$DB_USER" -d "$DB_NAME" \
  -T "events*" \
  -F p | gzip > "$BACKUP_FILE"

echo "✅ Backup successfully completed: $BACKUP_FILE"

# Optional: Cleanup backups older than 7 days
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -exec rm {} \;
echo "🧹 Cleaned up historic backups."
