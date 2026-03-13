#!/bin/bash
set -e

# Daily Full Backup & Hourly Incremental Blueprint

DB_USER=${POSTGRES_USER:-user}
DB_NAME=${POSTGRES_DB:-sentinel}
BACKUP_DIR="/var/backups/postgresql/sentinel"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p "$BACKUP_DIR"

if [ "$1" == "full" ]; then
    echo "Starting Full PostgreSQL Backup..."
    BACKUP_FILE="$BACKUP_DIR/full_backup_$TIMESTAMP.sql.gz"
    
    # Dump fully utilizing compression natively
    pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
    
    echo "Full Backup successfully created: $BACKUP_FILE"
    
elif [ "$1" == "schema" ]; then
    echo "Starting Schema-Only Backup..."
    BACKUP_FILE="$BACKUP_DIR/schema_backup_$TIMESTAMP.sql"
    
    # Export native DDL definitions gracefully
    pg_dump -s -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
    
    echo "Schema Backup successfully created: $BACKUP_FILE"

else
    echo "Usage: $0 {full|schema}"
    exit 1
fi

# Rotate backups older than 7 days automatically
find "$BACKUP_DIR" -type f -name "*.gz" -mtime +7 -exec rm {} \;
find "$BACKUP_DIR" -type f -name "*.sql" -mtime +7 -exec rm {} \;

echo "Backup rotation complete."
