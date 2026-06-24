#!/bin/sh
set -e

mkdir -p /app/uploads /app/backups
chown -R node:node /app/uploads /app/backups

exec gosu node "$@"
