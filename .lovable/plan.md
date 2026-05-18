## Decisão de arquitetura

**Recomendação: rodar tudo neste projeto** usando TanStack Start server functions + Lovable Cloud (Supabase gerenciado). Motivos:

- Sem segundo repo para manter, deploy ou monitorar.
- `createServerFn` cobre Admin API (`/admin/*`), e `src/routes/api/public/*` cobre webhooks externos (Meta, Descubra).
- Secrets sensíveis (service role do Descubra, tokens Meta, Gemini) ficam em `process.env` server-side e nunca no bundle.
- Auth real (login, signup, reset, RLS) sai pronta do Lovable Cloud — substitui o `auth.ts` mock atual.
- O guata-channel-api separado do doc 04 vira plano B caso o volume cresça muito; hoje é overkill.

Lovable Cloud do projeto = banco operacional do Channel (sessions, messages, triagens, channel_posts, agency_services, consultores).
Supabase do Descubra MS = **somente leitura** (KB, prompts, eventos).

---

## Como tudo se conecta

```text
WhatsApp ──► Meta Cloud API ──► POST /api/public/webhooks/whatsapp
                                       │
                                       ▼
                              processMessage()  ◄── lê Descubra (KB, prompts, eventos)
                                       │              via service role server-side
                                       ├─► Gemini (Lovable AI Gateway)
                                       └─► grava em sessions / messages (Cloud)

Admin Descubra publica evento ──► Database Webhook Supabase
                                       │
                                       ▼
                         POST /api/public/webhooks/descubra-ms
                              (verifica Bearer secret)
                                       │
                                       ▼
                              insert channel_posts (rascunho)

Painel (este app)  ──► createServerFn ──► Cloud (RLS por consultor)
                       └── leitura ao vivo de eventos publicados (anon key)
```

Três camadas, um deploy só.

---

## Plano de implementação

### Etapa 1 — Habilitar Lovable Cloud e auth real

1. Ativar Lovable Cloud.
2. Migrations:
   - `profiles` (id ref `auth.users`, nome, email, `must_change_password boolean default true`, `created_at`).
   - Enum `app_role` (`admin`, `consultor`) + tabela `user_roles` + função `has_role` (security definer).
   - Trigger `on_auth_user_created` → cria `profiles` automaticamente.
3. Substituir `src/lib/auth.ts` mock pelo cliente Supabase Cloud real.
4. Tela `/login` usa `supabase.auth.signInWithPassword`.
5. Após login: se `profiles.must_change_password = true` → redireciona para `/trocar-senha` (rota nova; bloqueia acesso ao restante até resetar).
6. Página `/admin/usuarios` (visível só para role `admin`) com botão **“Cadastrar consultor”**: cria usuário via server function admin (`supabaseAdmin.auth.admin.createUser`), seta senha temporária e `must_change_password = true`.
7. Seed do primeiro admin: `guilhermearevalo27@gmail.com` criado por migration + senha temporária definida por você no primeiro deploy (Lovable Cloud → Users) ou via server function de bootstrap. Role `admin` inserida em `user_roles`.
8. Fluxo “Esqueci a senha” usando `resetPasswordForEmail` + página `/reset-password`.

### Etapa 2 — Banco operacional do Channel

Migrations para as tabelas do doc 04 (snake_case no DB, camelCase na API):
`sessions`, `messages`, `travel_intake`, `channel_posts`, `agency_services`, `channel_settings`.
RLS:
- Consultor lê tudo de triagens/conversas; só admin altera `agency_services` e `channel_settings`.
- Webhooks usam `supabaseAdmin` (service role) e bypassam RLS.

### Etapa 3 — Admin API real (substitui o mock)

Reescrever `src/lib/api/client.ts` para chamar `createServerFn` em vez do estado em memória. Cada endpoint do contrato vira uma server function em `src/lib/admin.functions.ts` protegida por `requireSupabaseAuth`:

- `getDashboardStats`, `listTriages`, `getTriage`, `updateTriage`, `assumeTriage`, `releaseBot`
- `listConversations`, `getConversation`, `replyConversation` (envia via Meta Cloud API)
- `listChannelPosts`, `updateChannelPost`
- `listServices`, `upsertService`, `deleteService`
- `getSettings`, `updateSettings`

Componentes/rotas existentes continuam funcionando — só troca a fonte dos dados.

### Etapa 4 — Integração Descubra (leitura)

Dois clientes no servidor:

- `descubra-anon.server.ts` → `VITE_DESCUBRA_SUPABASE_URL` + publishable key, usado em server fn pública para listar eventos para a aba **Canal** (substitui o mock atual; mantém o fallback se as envs não estiverem definidas).
- `descubra-admin.server.ts` → `DESCUBRA_SUPABASE_URL` + `DESCUBRA_SUPABASE_SERVICE_ROLE_KEY`, usado pelo pipeline de mensagens para ler `guata_knowledge_base`, `ai_prompt_configs` (`chatbot_name='guata'`) e `events_public`.

> Você disse que tem URL + publishable key. Para o brain funcionar com KB e prompts, vai precisar também da **service role** do Descubra (server-only). Sem ela, dá para começar só com eventos públicos e plugar o brain depois.

### Etapa 5 — Webhook Descubra → Canal

`src/routes/api/public/webhooks/descubra-ms.ts`:

- Aceita payload Supabase Database Webhook ou formato `event.published`.
- Verifica `Authorization: Bearer ${DESCUBRA_WEBHOOK_SECRET}` em tempo constante.
- Monta `body` formatado e insere `channel_posts` com `status='rascunho'` via `supabaseAdmin`.
- URL fica visível em `/configuracoes` para copiar no admin do Descubra.

### Etapa 6 — Brain compartilhado + pipeline de mensagem

`src/lib/message-pipeline.server.ts` com `processMessage(ctx)`:

1. Carrega/cria sessão (Cloud).
2. Comandos globais `menu` / `humano`.
3. Se `mode='humano'` → só loga.
4. Se `mode='triagem'` → state machine `intake_state`.
5. Senão classifica com Gemini (Lovable AI Gateway, `process.env.LOVABLE_API_KEY`).
6. `turismo_geral` → busca KB do Descubra; miss → RAG sobre eventos + persona do `ai_prompt_configs`.
7. `agencia` → checa `agency_services`; inicia triagem ou explica limite.
8. Persiste `messages` e devolve resposta(s).

Triagem completa → cria `travel_intake` com protocolo `VG-XXXX`, `mode='aguardando'`.

### Etapa 7 — Webhook Meta + envio outbound

- `src/routes/api/public/webhooks/whatsapp.ts`: GET handshake (`hub.verify_token`), POST valida HMAC `X-Hub-Signature-256` com `META_APP_SECRET`, extrai `phone_number_id` → `line`, chama `processMessage`.
- `meta-send.server.ts`: POST `graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` com `typing_on` + delay; usado por `replyConversation` e pelo pipeline.
- Suporta 2 números (sufixos `_DESCUBRA` / `_VIAGENS` nas envs).

### Etapa 8 — Cleanup

- Remover guarda “mock em produção” quando todas as rotas tiverem backend real.
- Atualizar `docs/02` e `docs/05` para refletir a nova arquitetura monorepo.

---

## Secrets necessários (Lovable Cloud → Secrets)

Server-only:
- `DESCUBRA_SUPABASE_URL`, `DESCUBRA_SUPABASE_SERVICE_ROLE_KEY` (para KB/prompts)
- `DESCUBRA_WEBHOOK_SECRET`
- `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID` (+ variantes `_VIAGENS` se 2 números)
- `LOVABLE_API_KEY` já vem com Lovable Cloud (Gemini via gateway).

Cliente (já em `.env` via Cloud):
- `VITE_DESCUBRA_SUPABASE_URL`, `VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY` (para listagem pública de eventos no painel, se quiser leitura direta do navegador).

---

## Fora do escopo desta entrega

- Publicação automática no WhatsApp Channel (Fase 2 — Meta não libera API estável hoje).
- Embeddings novos para KB (reusa o que o Descubra já tem).
- Migração final para Supabase Auth do Descubra (esta arquitetura usa Cloud próprio para consultores; o usuário final de WhatsApp não loga).

---

## Perguntas antes de começar

1. Posso **ativar Lovable Cloud** agora? (necessário para auth, banco operacional e secrets).
2. Você consegue a **service role key do Supabase do Descubra**, ou começo só com os eventos públicos e deixo o brain (KB + prompts) preparado para plugar depois?
3. Vamos com **dois números WhatsApp** (Descubra + Viagens) ou **um número com modos** na primeira versão? (Etapas 6/7 mudam pouco, mas as envs são diferentes.)
4. Confirma a senha temporária inicial do admin `guilhermearevalo27@gmail.com` por canal seguro (eu não devo escolher senha em código) — você prefere recebê-la por email automático (`inviteUserByEmail`) ou definir manualmente no painel do Cloud na primeira execução?