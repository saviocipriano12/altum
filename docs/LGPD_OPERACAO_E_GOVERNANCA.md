# LGPD - Operacao e Governanca (ALTUM)

Data: 15/04/2026

## 1) Objetivo
Estabelecer controles minimos para tratamento de dados pessoais em conformidade com a LGPD, com foco na operacao da plataforma (WhatsApp, redes sociais e gestao de leads).

## 2) Classificacao de Papel
- ALTUM como `Controladora`: dados de marketing/prospeccao da propria ALTUM.
- ALTUM como `Operadora`: dados tratados em nome de clientes (tenant).

## 3) Registro de Operacoes (RoPA)
Cada fluxo deve conter:
- finalidade;
- categorias de dados;
- base legal;
- compartilhamentos;
- prazo de retencao;
- medidas de seguranca;
- papel (controlador/operador).

## 4) Bases Legais
- Execucao de contrato.
- Cumprimento de obrigacao legal/regulatoria.
- Legitimo interesse (com avaliacao de impacto quando aplicavel).
- Consentimento (quando exigido).

## 5) Direitos dos Titulares (DSAR)
Canal unico: `suporte.altum@gmail.com`.
SLA interno recomendado:
- confirmacao de recebimento: ate 2 dias uteis;
- resposta conclusiva: ate 15 dias corridos (ou justificativa formal).

## 6) Seguranca Minima Obrigatoria
- MFA para contas administrativas.
- Segregacao por tenant.
- Logs de auditoria para acoes sensiveis.
- Criptografia de segredos de integracao.
- Rotacao de credenciais periodica.

## 7) Incidentes
Procedimento minimo:
- classificacao de severidade;
- contencao tecnica;
- analise de impacto;
- comunicacao ao controlador e, quando aplicavel, a ANPD/titulares.

## 8) Retencao e Descarte
- Definir prazos por tipo de dado.
- Executar descarte/anonimizacao automatizada quando prazo expirar.
- Registrar evidencias de descarte.

## 9) Terceiros e Suboperadores
Manter lista de terceiros com:
- servico prestado;
- local de processamento;
- base legal de compartilhamento;
- instrumento contratual vigente.

## 10) Check de Go-Live
- Politica de Privacidade publicada.
- DPA padrao com clientes validado.
- Fluxo DSAR operacional.
- Procedimento de incidente aprovado.
- Segredos e webhooks protegidos em producao.
