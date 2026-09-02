#!/usr/bin/env bash
set -euo pipefail

job=${1:-}
case "$job" in
  ai) path='/api/internal/jobs/ai/process?drain=1&limit=40' ;;
  automations) path='/api/internal/jobs/automations/process?limit=60' ;;
  chat) path='/api/internal/jobs/chat-outbound/process?limit=80' ;;
  outbound) path='/api/internal/jobs/outbound-campaigns/process?limit=100' ;;
  campaigns) path='/api/internal/jobs/campaigns/sync?days=1&limit=20' ;;
  push) path='/api/internal/jobs/client-portal/push-critical?maxTenants=80' ;;
  integrations) path='/api/internal/jobs/integrations/health?maxTenants=80' ;;
  commerce) path='/api/internal/jobs/commerce/sync?connectionLimit=6&itemLimit=15&minimumIntervalMinutes=45' ;;
  reports) path='/api/internal/jobs/daily-reports/send?maxTenants=120' ;;
  billing) path='/api/internal/jobs/finance/contract-billing?maxContracts=160' ;;
  *) echo "unknown_job=$job" >&2; exit 64 ;;
esac

exec 9>"/run/lock/altum-job-$job.lock"
if ! flock -n 9; then
  echo "job=$job status=skipped reason=already_running"
  exit 0
fi

response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

status=$(curl --silent --show-error --location \
  --retry 2 --retry-all-errors --max-time 115 \
  --output "$response_file" --write-out '%{http_code}' \
  --header "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL$path")

printf 'job=%s http_status=%s response=' "$job" "$status"
head -c 2000 "$response_file" | tr '\n' ' '
printf '\n'

case "$status" in
  2*) exit 0 ;;
  *) exit 1 ;;
esac
