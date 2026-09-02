# Evolution API da Altum

Stack isolada para WhatsApp por QR Code em `evolution.altumia.com.br`.

- Evolution API `v2.3.7` fixada, sem uso de `latest`.
- PostgreSQL e Redis acessíveis somente pela rede interna do Docker.
- Caddy como único ponto público em HTTP/HTTPS.
- Segredos vivem apenas em `/opt/altum-evolution/.env` na VPS.
- Backup diário de PostgreSQL e sessões com retenção local de 14 dias.

O arquivo `.env.example` nunca deve receber credenciais reais.
