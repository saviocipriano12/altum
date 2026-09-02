#!/usr/bin/env bash
set -euo pipefail

cd /opt/altum-evolution
set -a
. ./.env
set +a

instance_name=altum-homologacao
instances=$(curl -fsS \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  https://evolution.altumia.com.br/instance/fetchInstances)

if ! printf '%s' "$instances" | jq -e --arg name "$instance_name" \
  'any(.[]; (.name // .instance.instanceName // .instanceName) == $name)' >/dev/null; then
  curl -fsS \
    -H "apikey: $AUTHENTICATION_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "{\"instanceName\":\"$instance_name\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
    https://evolution.altumia.com.br/instance/create > /tmp/evolution-create.json
fi

curl -fsS \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  "https://evolution.altumia.com.br/instance/connect/$instance_name" > /tmp/evolution-qr.json

jq -c --arg instance "$instance_name" '{
  instance: $instance,
  qrGenerated: (((.base64 // .qrcode.base64 // .code // .qrcode.code) // "") | length > 20),
  pairingCodeGenerated: (((.pairingCode // .qrcode.pairingCode) // "") | length > 3)
}' /tmp/evolution-qr.json
