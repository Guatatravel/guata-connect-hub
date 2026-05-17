# Opções A e B — Mesmo Guatá do site no WhatsApp

O **guata-channel-api** pode usar o cérebro do Descubra MS de **duas formas** (ou as duas juntas).

## Opção A — Supabase direto (recomendada como base)

A API **lê** o mesmo banco do site (sem copiar dados):

| Tabela | Uso |
|--------|-----|
| `guata_knowledge_base` | Respostas turísticas |
| `ai_prompt_configs` (`chatbot_name = guata`) | Persona / system prompt |
| `events` / `events_public` | Contexto de eventos |

Variáveis na **guata-channel-api**:

```env
DESCUBRA_SUPABASE_URL=https://xxxx.supabase.co
DESCUBRA_SUPABASE_SERVICE_ROLE_KEY=eyJ...   # só no servidor
GUATA_BRAIN_MODE=supabase
```

Fluxo: mensagem → busca KB → se miss, Gemini local com prompt do site + eventos.

## Opção B — API de chat do site

Se o Descubra já expõe um endpoint de chat, o Channel **delega** a resposta:

```env
DESCUBRA_CHAT_API_URL=https://SEU_ENDPOINT/chat
DESCUBRA_CHAT_API_KEY=opcional
GUATA_BRAIN_MODE=site_api
```

Body enviado:

```json
{
  "message": "O que fazer em Bonito?",
  "session_id": "uuid-da-sessao",
  "channel": "whatsapp"
}
```

Resposta aceita (qualquer um dos campos): `reply`, `text`, `message`, `response`, `answer`.

**Vantagem:** zero divergência — WhatsApp usa **exatamente** a mesma lógica do site.  
**Requisito:** o time Descubra informar a URL e o formato real do endpoint.

## Hybrid (padrão)

```env
GUATA_BRAIN_MODE=hybrid
```

Ordem:

1. Hit forte na **KB** (Supabase) → resposta rápida  
2. Senão → **API do site** (opção B)  
3. Senão → **Supabase + Gemini local** (opção A)

Configure **A + B** juntas para máxima resiliência.

## Verificar no ar

```http
GET http://localhost:3000/health
```

```json
"guataBrain": {
  "mode": "hybrid",
  "supabase": true,
  "siteChatApi": true,
  "gemini": true
}
```

## O que pedir ao time Descubra MS

1. URL + chave da **API de chat** (opção B), se existir  
2. Credenciais **service role** do Supabase (opção A)  
3. Webhook `event.published` → `POST /webhooks/descubra-ms` na API Channel  

## WhatsApp

Opções A/B alimentam só o **texto** do Guatá. Para o cliente receber no celular, ainda é necessário **Meta WhatsApp Cloud API** (webhook + tokens).
