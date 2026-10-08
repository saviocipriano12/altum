# Bridge de mídia da Altum

O Creative Studio não envia prompts diretamente para interfaces locais. Ele conversa com um **bridge** pequeno, instalado perto do runtime escolhido (ComfyUI, LTX, OpenMontage ou outro executor). Assim, a Altum mantém controle de aprovação, credenciais e auditoria; o bridge fica responsável por traduzir o job para o workflow/modelo local.

## Contrato HTTP

Configure a URL do bridge em **Administração → Conexões**. Ela deve ser HTTPS, exceto quando o bridge estiver em `localhost` no mesmo ambiente da Altum.

### Health check

`GET /` deve responder:

```json
{
  "ok": true,
  "provider": "comfyui",
  "capabilities": ["GENERATE_IMAGE", "GENERATE_VIDEO"]
}
```

Quando houver token, a Altum envia `Authorization: Bearer <token>`; também envia `X-Altum-Creative-Version: 1`.

### Execução

`POST /` recebe:

```json
{
  "jobId": "id-do-job",
  "providerId": "comfyui",
  "capability": "GENERATE_IMAGE",
  "format": "image",
  "prompt": "direção criativa aprovada",
  "context": {
    "tenantId": "empresa",
    "projectId": "projeto",
    "outputId": "rascunho"
  }
}
```

Resposta assíncrona:

```json
{ "jobId": "runtime-job-123", "status": "submitted" }
```

Resposta com asset final:

```json
{
  "jobId": "runtime-job-123",
  "status": "completed",
  "assetUrl": "https://storage.exemplo.com/midia/arquivo.mp4"
}
```

O bridge não deve aceitar comandos arbitrários do prompt, expor interfaces administrativas, nem publicar o asset por conta própria. A publicação continua sendo uma ação separada e aprovada na Altum.
