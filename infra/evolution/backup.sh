#!/usr/bin/env sh
set -eu

STACK_DIR=/opt/altum-evolution
BACKUP_DIR=/var/backups/altum-evolution
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"
cd "$STACK_DIR"
set -a
. ./.env
set +a

docker compose exec -T postgres pg_dump \
  --username "$POSTGRES_USERNAME" \
  --dbname "$POSTGRES_DATABASE" \
  --format custom > "$BACKUP_DIR/postgres-$STAMP.dump"

docker run --rm \
  --volumes-from evolution_api \
  -v "$BACKUP_DIR:/backup" \
  alpine:3.21 \
  tar -czf "/backup/instances-$STAMP.tar.gz" -C /evolution instances

find "$BACKUP_DIR" -type f -mtime +14 -delete

