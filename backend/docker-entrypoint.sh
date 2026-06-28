#!/bin/sh
set -e

mkdir -p /app/uploads /app/backups
chown -R node:node /app/uploads /app/backups

# Run migrations with retry to avoid tight restart loop on transient DB failures
max_retries=3
retry=0
until gosu node npx --no-install prisma migrate deploy; do
  retry=$((retry + 1))
  if [ $retry -ge $max_retries ]; then
    echo "Migration failed after $max_retries attempts. Waiting 30s before exit to slow restart loop." >&2
    sleep 30
    exit 1
  fi
  echo "Migration attempt $retry failed. Retrying in 10s..." >&2
  sleep 10
done

# Seed: auto-run in dev; in production only when SEED_ON_START=true
if [ "$NODE_ENV" != "production" ] || [ "$SEED_ON_START" = "true" ]; then
  gosu node node dist/prisma/seed.js || echo "Seed skipped (may require SEED_* env vars)." >&2
fi

exec gosu node "$@"
