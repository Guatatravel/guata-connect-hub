# guata-connect-hub — Painel Guatá Channel

Repositório: **guata-connect-hub**  
Função: **painel operacional web** para consultores da Guatá Viagens e operação do Canal WhatsApp.

## O que este repo É e NÃO é

| É | Não é (fora de escopo atual) |
|---|------------------------------|
| UI para dashboard, triagens, conversas, canal, configurações | Webhook Meta Cloud API |
| Camada de API **mockada** com contrato estável | Lógica Gemini / classificação |
| Tipos e componentes alinhados ao ecossistema | Publicação real no WhatsApp Channel |
| Hook Supabase secundário (Descubra) via env | Backend de produção (ainda) |
| Auth mock em `localStorage` | `whatsapp-web.js` |

Quando `VITE_GUATA_API_URL` estiver definida, o mesmo `src/lib/api/client.ts` passa a fazer `fetch` real **sem alterar as páginas**.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | TanStack Start + React 19 |
| Roteamento | TanStack Router (file-based em `src/routes/`) |
| Dados | TanStack Query |
| UI | Tailwind 4 + shadcn/ui |
| Deploy alvo | Cloudflare Workers (`wrangler.jsonc`, `src/server.ts`) |
| Supabase | `@supabase/supabase-js` (cliente Descubra opcional) |

Scripts: `bun run dev` | `bun run build` | `bun run preview`

---

## Estrutura de pastas (relevante)

```
src/
  routes/           # Páginas (TanStack file routes)
  components/guata/ # Sidebar, badges, ChatTimeline
  lib/
    api/client.ts   # API admin (mock ou real)
    mocks/data.ts   # Seed determinístico
    auth.ts         # Sessão localStorage
  integrations/descubra/client.ts
  types/guata.ts    # Modelo de domínio
  styles.css        # Design tokens (verde/dourado/bege)
docs/               # Esta documentação
```

---

## Rotas do painel

| Rota | Função |
|------|--------|
| `/` | Redireciona para `/dashboard` ou `/login` |
| `/login` | Email/senha mock (qualquer credencial) |
| `/dashboard` | KPIs + últimas triagens + alerta posts pendentes |
| `/triagens` | Fila filtrável (status, linha, consultor, destino) |
| `/triagens/:id` | Formulário coletado + timeline + notas + ações |
| `/conversas` | Lista de sessões WhatsApp |
| `/conversas/:id` | Timeline + resposta consultor |
| `/canal` | Posts de eventos (rascunho → copiar → marcar publicado) |
| `/configuracoes` | Meta (mock), webhooks read-only, boas-vindas, gatilhos, serviços agência |

Layout protegido: `src/routes/_app.tsx` (sidebar + header “Guatá Channel”).

---

## Modelo de dados (`src/types/guata.ts`)

### Linhas WhatsApp

```ts
type WhatsAppLine = "descubra_ms" | "guata_viagens";
```

### Modos de sessão

```ts
type SessionMode = "informacional" | "triagem" | "humano" | "aguardando";
```

### Triagem comercial (`TravelIntake`)

Formulário coletado pelo bot na linha Viagens: protocolo, destino, datas, viajantes, faixa de orçamento, status do funil (`novo` → `perdido`), consultor atribuído, notas.

### Conversa (`Conversation`)

Telefone, linha, modo, última mensagem, array `ChatMessage` com `role: user | bot | human`.

### Post de Canal (`ChannelPost`)

Gerado a partir de evento Descubra: thumbnail, título, data, cidade, link, corpo formatado, status `rascunho | publicado | ignororado`.

### Serviço da agência (`AgencyService`)

CRUD no painel — usado pelo bot (futuro) para saber o que a agência oferece por região.

---

## API admin (contrato)

Base: `{VITE_GUATA_API_URL}/admin/...`

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/dashboard/stats` | KPIs + últimas 5 triagens |
| GET | `/triages` | Lista com filtros |
| GET | `/triages/:id` | Detalhe |
| PATCH | `/triages/:id` | Atualizar status, notas, consultor |
| POST | `/triages/:id/assume` | Assumir triagem |
| POST | `/triages/:id/release-bot` | Encerrar humano → bot |
| GET | `/conversations` | Lista sessões |
| GET | `/conversations/:id` | Detalhe + mensagens |
| POST | `/conversations/:id/reply` | Mensagem consultor (→ `humano`) |
| GET | `/channel-posts` | Fila Canal |
| PATCH | `/channel-posts/:id` | Marcar publicado/ignorado |
| GET/PUT | `/agency-services` | Serviços da agência |
| GET/PATCH | `/settings` | Boas-vindas, gatilhos, URLs webhook |

Implementação mock: estado mutável em memória por sessão do browser (`src/lib/api/client.ts`).

---

## Variáveis de ambiente

| Variável | Obrigatória | Efeito |
|----------|-------------|--------|
| `VITE_GUATA_API_URL` | Não | Se ausente → API mock |
| `VITE_DESCUBRA_SUPABASE_URL` | Não | Cliente Supabase Descubra |
| `VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY` | Não | Chave anon/public do Descubra |

Badge **“Modo mock — integração Descubra pendente”** na página Canal quando as envs Descubra não estão configuradas.

---

## Autenticação

- Chave: `guata.channel.session` no `localStorage`
- `signIn(email)` aceita qualquer email no mock
- Preparado para trocar por `supabase.auth.signInWithPassword` quando o backend/auth Cloud existir

---

## Componentes de domínio

| Componente | Arquivo |
|------------|---------|
| `AppSidebar` | Navegação + logout |
| `LineBadge` | Descubra MS (verde) / Guatá Viagens (dourado) |
| `TriagemStatusBadge` / `SessionModeBadge` | Estados visuais |
| `ChatTimeline` | Bolhas user / bot / humano |

Consultores mock: `CONSULTORES` em `guata.ts` (Ana, Bruno, Carla, Diego).

---

## Design system

Tokens em `src/styles.css` (oklch):

- `--primary` → verde `#1F4D2C`
- `--accent` → dourado `#C9A24C`
- `--background` → bege `#FAF6EC`

Cards `rounded-2xl`, toasts em pt-BR (Sonner).

---

## Plano original

O arquivo `.lovable/plan.md` descreve o escopo Lovable usado para gerar este painel; esta pasta `docs/` consolida visão de produto + estado técnico do repo.
