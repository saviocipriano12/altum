# Agendamentos operacionais da Altum

A VPS dispara os endpoints protegidos da Altum, preservando o processamento frequente sem depender dos limites de Cron Jobs do plano Hobby da Vercel.

- `ai`: a cada minuto, para recuperar decisoes de IA que ficaram pendentes apos o webhook ou uma tentativa inline
- `chat`: a cada minuto, para retomar mensagens e midias que ficaram pendentes
- `outbound`: a cada minuto
- `commerce`: a cada hora
- demais jobs: diariamente nos mesmos horarios UTC antes definidos em `vercel.json`
- `flock` impede duas execucoes simultaneas do mesmo job
- o segredo vive somente na Vercel e em `/opt/altum-jobs/.env` na VPS

Depois de publicar uma alteracao nos arquivos de timer, execute `sudo ./install.sh` dentro desta pasta na VPS para reinstalar as units e recarregar o systemd. Confirme com `systemctl status altum-job-ai.timer` e `systemctl list-timers altum-job-ai.timer`.
