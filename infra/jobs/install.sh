#!/usr/bin/env bash
set -euo pipefail

install -d -m 750 -o root -g altumops /opt/altum-jobs
install -m 750 -o root -g altumops run-job.sh /opt/altum-jobs/run-job.sh

if [ ! -f /opt/altum-jobs/.env ]; then
  printf 'BASE_URL=https://www.altumia.com.br\nCRON_SECRET=%s\n' "$(openssl rand -hex 48)" \
    > /opt/altum-jobs/.env
fi
chown root:altumops /opt/altum-jobs/.env
chmod 640 /opt/altum-jobs/.env

install -m 644 altum-job@.service /etc/systemd/system/altum-job@.service
for timer in altum-job-*.timer; do
  install -m 644 "$timer" "/etc/systemd/system/$timer"
done

systemctl daemon-reload
systemctl enable --now \
  altum-job-chat.timer \
  altum-job-outbound.timer \
  altum-job-commerce.timer \
  altum-job-ai.timer \
  altum-job-automations.timer \
  altum-job-campaigns.timer \
  altum-job-push.timer \
  altum-job-integrations.timer \
  altum-job-reports.timer \
  altum-job-billing.timer
