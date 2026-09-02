# Agendamentos operacionais da Altum

A VPS dispara os endpoints protegidos da Altum, preservando o processamento frequente sem depender dos limites de Cron Jobs do plano Hobby da Vercel.

- `chat`: a cada minuto, para retomar mensagens e midias que ficaram pendentes
- `outbound`: a cada minuto
- `commerce`: a cada hora
- demais jobs: diariamente nos mesmos horarios UTC antes definidos em `vercel.json`
- `flock` impede duas execucoes simultaneas do mesmo job
- o segredo vive somente na Vercel e em `/opt/altum-jobs/.env` na VPS
