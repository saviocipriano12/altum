# Infraestrutura própria de reuniões da Altum

## Objetivo desta etapa

A Altum usa o núcleo open source do Vexa apenas como camada de entrada e captura em Google Meet e Zoom. O gateway e os bots ficam em infraestrutura administrada pela Altum. Nesta primeira etapa não existe GPU:

1. o bot entra na reunião como um participante visível;
2. o Vexa grava somente o áudio no MinIO da Altum;
3. ao encerrar, a API da Altum busca a gravação pelo gateway privado;
4. a OpenAI transcreve o arquivo;
5. a Altum gera resumo e atualiza o CRM pelos fluxos que já existem.

O modo enviado ao Vexa é sempre `transcribe_enabled=false` e `recording_enabled=true`. Assim, nenhum serviço de transcrição hospedado pelo Vexa é necessário.

## Implantação do capturador

Use um servidor Linux separado da aplicação web, com Docker Engine 26 ou superior. Instale a versão estável do repositório Apache-2.0 `Vexa-ai/vexa` e execute o perfil Compose documentado pelo projeto (`make all`). Mantenha Postgres, Valkey, MinIO, runtime e gateway em rede privada.

Requisitos iniciais sugeridos para homologação:

- Ubuntu 24.04;
- 4 vCPU e 8 GB de RAM;
- Docker Engine 26+;
- disco persistente para Postgres e MinIO;
- acesso de saída para Google Meet e Zoom;
- gateway `:18056` acessível somente pela aplicação Altum.

Não exponha o gateway diretamente à internet. Em produção, coloque um proxy privado/TLS entre a aplicação e o gateway e aplique limite de requisições.

## Variáveis na aplicação Altum

```env
ALTUM_MEETING_BOT_API_URL=http://meeting-gateway:18056
ALTUM_MEETING_BOT_API_KEY=vxa_...
ALTUM_MEETING_BOT_NAME="Altum IA"
OPENAI_API_KEY=...
OPENAI_MEETING_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

A chave do gateway é usada exclusivamente no servidor. Ela não possui prefixo `NEXT_PUBLIC_` e nunca deve ser enviada ao navegador.

## Fluxo de homologação

1. Entre na área do cliente usando um papel interno `agency_owner` ou `agency_admin`.
2. Abra **Reuniões com IA**, informe um link real do Meet ou Zoom e clique em **Enviar bot**.
3. Autorize a entrada do participante `Altum IA` na reunião.
4. Ao terminar, clique em **Encerrar captura** e aguarde o status terminal.
5. Clique em **Processar gravação**. O texto retornado será preenchido no formulário de análise.
6. Selecione o lead e gere a análise para salvar resumo e próximos passos no CRM.

## Limites conhecidos desta etapa

- A transcrição ocorre depois da reunião, não em tempo real.
- A rota de processamento aceita gravações de até 24 MB, limite seguro para a API de transcrição atual.
- Reuniões maiores precisarão do worker assíncrono de segmentação de áudio previsto para a próxima etapa.
- O host deve informar os participantes e obter consentimento para gravação conforme a política da Altum e a legislação aplicável.
- O Vexa 0.12 ainda declara a reprodução ponta a ponta de gravações como uma área em validação; homologar com Meet e Zoom antes de liberar a clientes.

## Próxima etapa técnica

Mover a finalização para uma fila durável, dividir gravações longas com FFmpeg, aplicar tentativas idempotentes e receber o evento assinado de conclusão. Depois disso, liberar gradualmente por tenant, com cota de minutos e retenção automática.
