#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_ROOT/$TIMESTAMP"

POSTGRES_USER="${POSTGRES_USER:-ticketing}"
POSTGRES_DB="${POSTGRES_DB:-ticketing}"

cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
  POSTGRES_USER="${POSTGRES_USER:-ticketing}"
  POSTGRES_DB="${POSTGRES_DB:-ticketing}"
fi

mkdir -p "$BACKUP_PATH"

echo "Backing up PostgreSQL database '$POSTGRES_DB' to $BACKUP_PATH/db.sql.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$BACKUP_PATH/db.sql.gz"

echo "Backing up uploads volume to $BACKUP_PATH/uploads.tar.gz"
docker compose run --rm --no-deps \
  -v "$BACKUP_PATH:/backup" \
  --entrypoint tar \
  api \
  -czf /backup/uploads.tar.gz -C /app/uploads .

cat > "$BACKUP_PATH/manifest.txt" <<EOF
created_at=$TIMESTAMP
postgres_db=$POSTGRES_DB
postgres_user=$POSTGRES_USER
uploads_source=api:/app/uploads
files=db.sql.gz uploads.tar.gz
EOF

echo "Backup complete: $BACKUP_PATH"
