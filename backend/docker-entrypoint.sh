#!/bin/sh
set -e

mkdir -p /app/uploads /app/backups

# Only chown recursively when the owner differs from the node user.
# On first start with empty Docker volumes the owner will be root,
# so chown is needed. On subsequent restarts the owner is already
# node, so we skip the potentially expensive recursive walk.
if [ "$(stat -c '%u' /app/uploads)" != "$(id -u node)" ] || [ "$(stat -c '%u' /app/backups)" != "$(id -u node)" ]; then
  chown -R node:node /app/uploads /app/backups
fi

# Run migrations with retry to avoid tight restart loop on transient DB failures
max_retries=3
retry=0
until gosu node node node_modules/.bin/prisma migrate deploy; do
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
  if [ ! -f dist/prisma/seed.js ]; then
    echo "Seed script not found at dist/prisma/seed.js — skipping." >&2
  else
    gosu node node dist/prisma/seed.js || {
      seed_exit=$?
      echo "Seed script failed with exit code $seed_exit. See seed logs above for details." >&2
      exit $seed_exit
    }
  fi
fi

exec gosu node "$@"
