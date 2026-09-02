#!/usr/bin/env bash
set -euo pipefail

cd /opt/altum-evolution
set -a
. ./.env
set +a

public_status=$(curl -sS -o /tmp/evo-root.json -w '%{http_code}' https://evolution.altumia.com.br/)
auth_status=$(curl -sS -o /tmp/evo-auth.json -w '%{http_code}' \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  https://evolution.altumia.com.br/instance/fetchInstances)

printf 'PUBLIC_STATUS=%s\nAUTH_STATUS=%s\n' "$public_status" "$auth_status"
jq -c '{status,message,version,error,response}' /tmp/evo-root.json
jq -c 'if type == "array" then {instances:length} else {status,error,response} end' /tmp/evo-auth.json
