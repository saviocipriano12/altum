#!/usr/bin/env bash
set -euo pipefail

STACK_DIR=/opt/altum-evolution
cd "$STACK_DIR"

if [ ! -f .env ]; then
  postgres_password=$(openssl rand -hex 32)
  redis_password=$(openssl rand -hex 32)
  evolution_api_key=$(openssl rand -hex 48)

  cp .env.example .env
  sed -i \
    -e "s/REPLACE_POSTGRES_PASSWORD/$postgres_password/g" \
    -e "s/REPLACE_REDIS_PASSWORD/$redis_password/g" \
    -e "s/REPLACE_EVOLUTION_API_KEY/$evolution_api_key/g" \
    .env
  chmod 600 .env
fi

docker compose config --quiet
docker compose pull
docker compose up -d --remove-orphans
sudo systemctl enable --now altum-evolution-backup.timer

echo DEPLOY_OK
