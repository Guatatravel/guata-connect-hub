# Plano — Painel Guatá Channel

Painel operacional web para WhatsApp do ecossistema Descubra MS + Guatá Viagens. Sem webhook nem IA neste app — apenas UI consumindo uma camada de API mockada, com hook preparado para Supabase do Descubra (KB + eventos).

## Stack e fundações

- TanStack Start (já no projeto) + TypeScript + Tailwind + shadcn/ui
- React Query para todas as chamadas (loading skeletons, toasts pt-BR via sonner)
- Camada `src/lib/api/` com fetch fake (delay 300–600ms) que simula `VITE_GUATA_API_URL`; troca por fetch real depois sem mudar componentes
- Dados fake em `src/lib/mocks/` (seed determinístico de triagens, conversas, posts, serviços)
- Tipos centralizados em `src/types/guata.ts`

## Design system

- Tokens em `src/styles.css` (oklch):
  - `--primary` verde floresta #1F4D2C
  - `--accent` dourado #C9A24C
  - `--background` bege #FAF6EC
  - foreground escuro neutro, bordas suaves
- Tipografia: Inter (body) + Fraunces (display) — caloroso e moderno
- Cards `rounded-2xl`, badges de status coloridos por estado, sombras leves
- Mascote Guatá: avatar SVG simples no header da sidebar

## Estrutura de rotas (TanStack file-based)

```
src/routes/
  __root.tsx              (já existe — adicionar QueryClientProvider + Toaster)
  index.tsx               → redireciona para /dashboard se logado, senão /login
  login.tsx               (mock auth localStorage; pronto p/ Supabase Auth)
  _app.tsx                (layout protegido com Sidebar + Outlet)
  _app.dashboard.tsx
  _app.triagens.tsx               (fila)
  _app.triagens.$id.tsx           (detalhe 2 colunas)
  _app.conversas.tsx
  _app.conversas.$id.tsx
  _app.canal.tsx
  _app.configuracoes.tsx
```

## Componentes principais

- `AppSidebar` (shadcn sidebar): Dashboard, Triagens Viagens, Conversas, Canal, Configurações + botão sair
- `StatusBadge` (novo/atribuído/contactado/proposta/fechado/perdido + modos sessão)
- `LineBadge` ("Descubra MS" verde / "Guatá Viagens" dourado) — reflete os 2 números no modelo
- `ChatTimeline` (bolhas usuário/bot/humano, horário)
- `IntakeForm` (read-only structured display dos campos coletados pelo bot)
- `StatCard`, `EmptyState`, `LoadingSkeleton`, `DataTable` com filtros

## Páginas (resumo do conteúdo)

1. **Dashboard** — 4 StatCards (triagens hoje, aguardando, em humano, conversas ativas), tabela últimas 5 triagens, alerta se posts pendentes
2. **Triagens** — DataTable filtrável (status/data/consultor/destino/linha), ações: Ver, Assumir, Atribuir
3. **Detalhe triagem** — 2 colunas (form coletado | timeline chat), topo com status/wa.me/linha, botões de ação, notas internas, caixa enviar mensagem (placeholder POST)
4. **Conversas** — lista sessões WhatsApp com modo, abrir read-only ou assumir
5. **Canal** — grid de posts gerados a partir de eventos, preview formatado p/ WhatsApp Channel, "Copiar texto" e "Marcar publicado"
6. **Configurações** — status Meta (mock), URLs webhook (read-only), textos editáveis (boas-vindas, gatilhos), CRUD simples de Serviços da Agência

## Modelo de dados (TS)

```ts
type WhatsAppLine = 'descubra_ms' | 'guata_viagens'
type SessionMode = 'informacional' | 'triagem' | 'humano' | 'aguardando'
type TriagemStatus = 'novo'|'atribuido'|'contactado'|'proposta_enviada'|'fechado'|'perdido'

TravelIntake { id, protocol, name, phone, line, destino, dataIda, dataVolta,
  viajantes, faixaOrcamento, status, assignedTo?, notes?, createdAt, updatedAt }
Conversation { id, phone, line, mode, lastMessageAt, lastMessage, messages[] }
ChatMessage { id, role:'user'|'bot'|'human', text, at }
ChannelPost { id, eventId, thumbnail, title, eventDate, city, link, body, status:'rascunho'|'publicado'|'ignorado' }
AgencyService { id, nome, descricao, regioes[], ativo }
```

Campo `line` presente em triagens e conversas para suportar 2 números (badge + filtro).

## Endpoints mockados (em `src/lib/api/`)

GET `/admin/dashboard/stats`, `/admin/triages?status=&line=`, `/admin/triages/:id`,
`/admin/conversations`, `/admin/conversations/:id`, `/admin/channel-posts`, `/admin/agency-services`
PATCH `/admin/triages/:id`, `/admin/channel-posts/:id`, `/admin/agency-services/:id`
POST `/admin/triages/:id/assume`, `/admin/triages/:id/release-bot`, `/admin/conversations/:id/reply`

Toggle por env: se `VITE_GUATA_API_URL` definido, usa fetch real; senão usa mock.

## Integração Supabase Descubra MS

Você confirmou que devo ler a base do Descubra (KB + eventos). **Preciso de uma informação antes de implementar:**

- Qual é o **nome ou ID do projeto Lovable do Descubra MS** (para eu copiar as credenciais publicáveis e tipos), ou
- Você prefere que eu deixe um cliente Supabase **secundário configurável via env** (`VITE_DESCUBRA_SUPABASE_URL` + `VITE_DESCUBRA_SUPABASE_PUBLISHABLE_KEY`) que você cola depois?

Plano padrão se não responder: criar `src/integrations/descubra/client.ts` lendo das envs acima, com fallback para mock de eventos. A página Canal lê `events` publicados e gera `ChannelPost` rascunho automaticamente.

## Auth

- Tela `/login` com email/senha
- Mock: aceita qualquer credencial, salva sessão fake em `localStorage`
- Wrapper `_app.tsx` redireciona p/ `/login` se não autenticado
- Estrutura pronta p/ trocar por `supabase.auth.signInWithPassword` quando Cloud for ativado

## Detalhes técnicos

- Sonner já configurado p/ toasts em pt-BR ("Triagem atribuída", "Erro ao salvar", etc.)
- React Query com `staleTime: 30s`, invalidação após PATCH/POST
- Skeletons em todas as listas/cards
- `wa.me/<phone>` em telefones clicáveis
- Acessibilidade: labels, foco visível, contraste AA verde/bege

## Fora de escopo (confirmado)

- Webhook Meta Cloud API
- Lógica de IA / Gemini / classificação de intenção
- Publicação real no WhatsApp Channel
- Backend real (será adicionado depois quando o time decidir Supabase Cloud vs backend separado)

---

**Pergunta única antes de implementar:** me passe o nome do projeto Lovable do Descubra MS (para ler KB/eventos) **ou** confirme "use envs configuráveis depois" para eu seguir com o cliente Supabase secundário plugável.
