#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/altum-evolution/.env}"
INSTANCE_NAME="${1:-}"
if [[ -z "$INSTANCE_NAME" ]]; then
  echo "usage: inspect-webhook.sh <instance-name>" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
status="$(curl -sS -o "$response_file" -w "%{http_code}" \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  "https://evolution.altumia.com.br/webhook/find/$(printf '%s' "$INSTANCE_NAME" | jq -sRr @uri)")"

echo "WEBHOOK_FIND_HTTP=$status"
if [[ "$status" == "200" ]]; then
  jq '{enabled:(.enabled // .webhook.enabled),url:(.url // .webhook.url),events:(.events // .webhook.events),hasHeaders:((((.headers // .webhook.headers) // {}) | length) > 0)}' "$response_file"
fi
