## O que falta para tudo funcionar de verdade

Hoje só existe a Etapa 1 (auth real + setup admin). O painel ainda lê do mock em memória, a aba Canal mostra dados falsos, não há webhook do Descubra, não há brain do Guatá e não há pipeline de WhatsApp. Este plano fecha as **etapas 2 a 7** de uma vez só.

---

## Pré-requisitos seus (antes de eu começar)

Para tudo ligar no fim, preciso destes secrets — vou pedir via formulário seguro logo no início:

**Descubra MS (você confirmou ter acesso admin):**
- `DESCUBRA_SUPABASE_URL` — URL do projeto Supabase do Descubra
- `DESCUBRA_SUPABASE_SERVICE_ROLE_KEY` — service role (server-only, lê KB + prompts)
- `VITE_DESCUBRA_SUPABASE_URL` + `VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY` — para leitura pública de eventos no painel
- `DESCUBRA_WEBHOOK_SECRET` — você escolhe uma string forte; cola no header `Authorization: Bearer …` do Database Webhook lá no Supabase do Descubra

**Meta WhatsApp (em aprovação):** deixo o código pronto e os campos vazios. Quando o número for aprovado, você roda `add_secret` para `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` e o webhook passa a funcionar sem precisar mexer em código.

**Já configurado:** `LOVABLE_API_KEY` (Gemini via gateway) — usado pelo brain.

---

## Etapa 2 — Banco operacional do Channel

Migration única criando as tabelas do contrato (doc 04), com GRANTs + RLS:

| Tabela | Para quê |
|---|---|
| `sessions` | 1 por (linha, telefone). Guarda `mode` (`bot`/`humano`/`triagem`/`aguardando`), `intake_state`, `intake_data`, `assigned_to` |
| `messages` | Histórico de mensagens (direction in/out, texto, metadata) |
| `travel_intake` | Triagens fechadas. Protocolo `VG-XXXX`, dados estruturados de viagem |
| `channel_posts` | Posts do Canal. `status='rascunho'` até consultor aprovar |
| `agency_services` | Catálogo da agência (define o que é "agência" vs "turismo geral") |
| `channel_settings` | 1 linha. Persona, horário, webhook URL, mensagens padrão |

**RLS:**
- Consultor autenticado lê tudo de sessions/messages/triagens/posts.
- Só `admin` faz UPDATE em `agency_services` e `channel_settings`.
- Service role bypassa tudo (webhooks).

Função `update_updated_at_column` + triggers em todas as tabelas com `updated_at`.

---

## Etapa 3 — Admin API real (mata o mock)

`src/lib/admin.functions.ts` — todos protegidos por `requireSupabaseAuth`. Substitui 1:1 o que `src/lib/api/client.ts` faz hoje em memória:

- `getDashboardStats` — agrega contadores de `sessions` + `triagens` + `channel_posts`
- `listTriages` / `getTriage` / `updateTriage` / `assumeTriage` / `releaseBot`
- `listConversations` / `getConversation` / `replyConversation` (envia via Meta no fim do fluxo)
- `listChannelPosts` / `updateChannelPost` (aprovar / editar rascunho)
- `listServices` / `upsertService` / `deleteService`
- `getSettings` / `updateSettings`

`src/lib/api/client.ts` vira fachada fina que chama os server fns via `useServerFn`. **Nenhuma tela precisa mudar** — só a fonte dos dados.

---

## Etapa 4 — Integração Descubra (leitura)

Dois clientes server-only, isolados:

```text
src/integrations/descubra/anon.server.ts    → lista eventos públicos (events_public)
src/integrations/descubra/admin.server.ts   → KB (guata_knowledge_base) + prompts (ai_prompt_configs)
```

Server fn `listDescubraEvents()` substitui o mock atual da aba Canal. Se as envs não estiverem definidas, fallback para mock (não quebra dev).

---

## Etapa 5 — Webhook Descubra → Canal

`src/routes/api/public/webhooks/descubra-ms.ts` (rota pública, bypassa auth):

1. Lê `Authorization: Bearer …` e compara em tempo constante com `DESCUBRA_WEBHOOK_SECRET`.
2. Aceita payload Database Webhook do Supabase (`type=INSERT|UPDATE`, `record={evento}`) **ou** formato `event.published` do doc 04.
3. Formata `body` (título + data + local + link) e insere `channel_posts` com `status='rascunho'` via `supabaseAdmin`.
4. URL final aparece em `/configuracoes` ("Webhook Descubra MS — copie no admin do Descubra").

Passo a passo de configuração do Database Webhook no Descubra fica documentado em `/configuracoes` também.

---

## Etapa 6 — Brain compartilhado + pipeline de mensagem

`src/lib/message-pipeline.server.ts` exporta `processMessage(ctx)`:

```text
1. carrega/cria sessão (telefone + linha)
2. comandos globais: "menu" / "humano" / "voltar"
3. mode=humano   → só persiste; consultor responde manualmente
4. mode=triagem  → state machine intake_state (origem→destino→datas→pax→orçamento→preferências)
5. classifica intent com Gemini (turismo_geral | agencia | misto)
6. turismo_geral → busca KB Descubra; miss → RAG sobre events_public + persona ai_prompt_configs
7. agencia       → checa agency_services; inicia triagem ou explica limite da agência
8. grava messages + retorna texto(s) para envio
```

Triagem completa → cria linha em `travel_intake` com `protocol='VG-XXXX'`, marca `sessions.mode='aguardando'` e notifica painel (via realtime, etapa futura).

Gemini chamado via Lovable AI Gateway (`google/gemini-2.5-flash` para classificação/respostas, `gemini-2.5-pro` para RAG denso).

---

## Etapa 7 — Webhook Meta + envio outbound

`src/routes/api/public/webhooks/whatsapp.ts`:
- **GET**: handshake (`hub.verify_token` ↔ `META_VERIFY_TOKEN`).
- **POST**: valida HMAC `X-Hub-Signature-256` com `META_APP_SECRET` em tempo constante. Extrai `phone_number_id` → identifica linha (Descubra/Viagens). Chama `processMessage`.

`src/lib/meta-send.server.ts`:
- POST `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` com bearer `META_ACCESS_TOKEN`.
- Suporta `typing_on` + delay artificial (mais humano).
- Usado por `replyConversation` (consultor no painel) **e** pelo pipeline (bot).

Suporta 1 ou 2 números via sufixo `_DESCUBRA` / `_VIAGENS` nas envs. Sem secret = endpoint retorna 503 limpo (não quebra deploy).

---

## Arquitetura final

```text
WhatsApp ─► Meta Cloud ─► /api/public/webhooks/whatsapp
                                │ (HMAC verify)
                                ▼
                         processMessage()
                          │      │      │
                          │      │      └─► Gemini (Lovable AI Gateway)
                          │      └─► Descubra (service role: KB + prompts + eventos)
                          └─► Cloud (sessions, messages, triagens)

Descubra publica evento ─► Database Webhook
                                │ (Bearer secret)
                                ▼
                       /api/public/webhooks/descubra-ms
                                │
                                ▼
                          channel_posts (rascunho)

Painel ─► useServerFn ─► createServerFn (requireSupabaseAuth) ─► Cloud
                                                              └─► Descubra (anon, leitura)
```

---

## Após eu terminar — o que VOCÊ faz

1. **Eu peço os secrets** no início (formulário seguro). Você cola e me libera.
2. **No Supabase do Descubra**: Database → Webhooks → Create. Tabela `events`, eventos Insert+Update, URL = a que aparecer em `/configuracoes`, header `Authorization: Bearer <DESCUBRA_WEBHOOK_SECRET>`.
3. **Teste**: publica um evento no Descubra → aparece em `/canal` como rascunho.
4. **Login no painel** com seu admin já criado.
5. **Quando Meta aprovar**: adiciona os 4 secrets `META_*`, configura webhook URL no Meta Business apontando para `/api/public/webhooks/whatsapp` com o `META_VERIFY_TOKEN`. WhatsApp passa a responder.

---

## Fora do escopo

- Publicar automaticamente no **WhatsApp Channel** (Meta não tem API estável — Fase 2).
- Re-embedar a KB (reuso a existente do Descubra).
- Realtime no painel (consultor precisa dar F5 para ver triagem nova) — adicionável depois com `supabase.channel`.
- Página `/reset-password` para "esqueci a senha" (só admin cria usuário hoje, conforme decidimos).

---

## Detalhes técnicos

- **Stack server**: `createServerFn` para tudo interno; `src/routes/api/public/*` só para webhooks Meta/Descubra.
- **Clients Supabase**: 3 isolados — browser (`client.ts`), auth middleware (`auth-middleware.ts`), admin (`client.server.ts`). Descubra ganha 2 análogos em `src/integrations/descubra/`.
- **Import graph**: tudo que toca service role fica em `*.server.ts`. Server fns em `*.functions.ts` finos (só declarações).
- **Validação**: Zod em todo `inputValidator` e em todo body de webhook.
- **Erros**: webhooks retornam 401/400 sem vazar detalhes; server fns retornam shape `{ data, error }` para erros recuperáveis.
- **Migration única** com todas as 6 tabelas + GRANTs + RLS + triggers, para garantir transação atômica.

Quando aprovar, começo pelos secrets, depois rodo a migration, depois código.