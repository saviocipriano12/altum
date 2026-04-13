# Go-Live Definitivo por Tenant

## Objetivo
Fechar um tenant para venda e operacao real sem depender de memoria tribal.

## Gates criticos

| Criterio | Como validar | Bloqueia go-live |
| --- | --- | --- |
| Canal conectado | Minimo de 1 canal externo com roteamento pronto no tenant | Sim |
| IA habilitada | IA ativa para o tenant | Sim |
| Base de conhecimento minima | Minimo de 3 documentos publicados | Sim |
| Owner e handoff definidos | Owner operacional nominal, handoff da IA, time padrao e equipe ativa | Sim |
| Limites de uso e custo | Budget mensal e cap de execucao configurados e abaixo do consumo atual | Sim |

## Criterios de apoio

| Criterio | Como validar | Bloqueia go-live |
| --- | --- | --- |
| Perfil comercial do tenant | Nome, nicho, contato principal e vertical definidos | Nao |
| Regras operacionais | SLA e time padrao configurados | Nao |
| Cobertura humana | Minimo de 1 usuario ativo e 1 online | Nao |

## Politica de score
- Score total: 0 a 100
- Criterio pronto: pontuacao completa
- Criterio em alerta: metade da pontuacao
- Criterio pendente ou bloqueado: zero

## Regra de liberacao
- Go-live so pode ser liberado quando todos os gates criticos estiverem prontos.
- Se qualquer gate critico voltar a falhar, o tenant volta para estado bloqueado.
- Toda tentativa de validacao deve ficar registrada no `tenant_settings.goLive`.

## Evidencias minimas para venda
- Tela `/cliente/painel/go-live` sem gates criticos bloqueando
- Ultima validacao registrada com status `approved`
- Custo e volume de IA abaixo dos limites do tenant
