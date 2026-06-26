#!/usr/bin/env bash
set -euo pipefail

# OPS-08: Restrict backup file permissions
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_ROOT/$TIMESTAMP"

cd "$ROOT_DIR"

# OPS-09: Parse only required env vars instead of sourcing entire .env
# This avoids issues with undefined vars (set -u) and shell syntax in .env
if [ -f "$ROOT_DIR/backend/.env" ]; then
  POSTGRES_USER="${POSTGRES_USER:-$(grep -E '^POSTGRES_USER=' "$ROOT_DIR/backend/.env" | head -1 | cut -d'=' -f2-)}"
  POSTGRES_DB="${POSTGRES_DB:-$(grep -E '^POSTGRES_DB=' "$ROOT_DIR/backend/.env" | head -1 | cut -d'=' -f2-)}"
fi

POSTGRES_USER="${POSTGRES_USER:-ticketing}"
POSTGRES_DB="${POSTGRES_DB:-ticketing}"

mkdir -p "$BACKUP_PATH"
chmod 700 "$BACKUP_PATH"

echo "Backing up PostgreSQL database '$POSTGRES_DB' to $BACKUP_PATH/db.sql.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$BACKUP_PATH/db.sql.gz"
chmod 600 "$BACKUP_PATH/db.sql.gz"

echo "Backing up uploads volume to $BACKUP_PATH/uploads.tar.gz"
docker compose run --rm --no-deps \
  -v "$BACKUP_PATH:/backup" \
  --entrypoint tar \
  api \
  -czf /backup/uploads.tar.gz -C /app/uploads .
chmod 600 "$BACKUP_PATH/uploads.tar.gz"

cat > "$BACKUP_PATH/manifest.txt" <<EOF
created_at=$TIMESTAMP
postgres_db=$POSTGRES_DB
postgres_user=$POSTGRES_USER
uploads_source=api:/app/uploads
files=db.sql.gz uploads.tar.gz
EOF
chmod 600 "$BACKUP_PATH/manifest.txt"

echo "Backup complete: $BACKUP_PATH"
