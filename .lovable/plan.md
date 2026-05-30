# Plano: deixar o Guatá Channel 100% no ar, 24/7

## Visão geral — o que estamos construindo (confirmado)

**Guatá Channel** é o cérebro operacional do WhatsApp do ecossistema **Descubra Mato Grosso do Sul**, com 2 linhas:

1. **Descubra MS** (turismo institucional) — bot Guatá responde dúvidas turísticas usando a base de conhecimento + eventos do Descubra MS; publica eventos no canal após aprovação humana.
2. **Viagens MS** (agência) — bot faz triagem (origem, destino, datas, pax, orçamento), gera protocolo e repassa para consultor humano.

Painel web para a equipe gerenciar conversas, triagens, posts, usuários e configurações.

## Onde fica o banco / quem é o "dono"

| Banco | Hospedagem | Acesso |
|---|---|---|
| **Guatá Channel (operacional)** | Lovable Cloud → Supabase `jztdpriuainptgzgiyal` | Sua conta Gmail do Lovable. Acesso pelo botão **View Backend** dentro do Lovable. |
| **Descubra MS (institucional)** | Supabase próprio seu | Sua conta admin (já configurada via secrets `DESCUBRA_SUPABASE_*`). Somente leitura a partir daqui. |

## Como funciona o 24/7

Tudo roda no servidor da Lovable após **Publish**. **Não depende** do seu computador, do navegador ou de qualquer máquina ligada. O que mantém isso vivo:
- Banco Lovable Cloud → sempre on.
- Webhooks `/api/public/webhooks/whatsapp` e `/api/public/webhooks/descubra-ms` → sempre on no domínio publicado.
- Pipeline do bot (IA, intake, respostas, envio Meta) → server-side, sem dependência de cliente.

**Único requisito**: clicar em **Publish** uma vez (e republicar a cada mudança grande). URL fixa: `https://guata-connect-hub.lovable.app`.

---

## Etapas desta rodada

### Etapa A — Meta WhatsApp: criar o App (guia)

Como você ainda não criou o App na Meta, vou te entregar um **passo-a-passo objetivo** (no chat, após o plano aprovado) para:
1. Criar App em developers.facebook.com → tipo **Business**.
2. Adicionar produto **WhatsApp**.
3. Vincular seu número (Business Manager → WhatsApp Manager).
4. Coletar: `App Secret`, `Phone Number ID`, `Access Token permanente (System User)`, e definir um `Verify Token` (você inventa).
5. Configurar Webhook na Meta apontando para:
   `https://guata-connect-hub.lovable.app/api/public/webhooks/whatsapp`
   Subscrição: `messages`.

Depois disso, eu peço os secrets:
- `META_APP_SECRET` (verifica assinatura)
- `META_VERIFY_TOKEN` (handshake)
- `META_ACCESS_TOKEN_DESCUBRA`
- `META_PHONE_NUMBER_ID_DESCUBRA`
- (opcionais p/ 2ª linha) `META_ACCESS_TOKEN_VIAGENS`, `META_PHONE_NUMBER_ID_VIAGENS`

### Etapa B — Painel real (matar mock)

Substituir `src/lib/api/client.ts` (mock) por server functions com `requireSupabaseAuth` lendo do Supabase real:
- `_app.dashboard.tsx` → stats reais (sessões/dia, triagens abertas, posts pendentes).
- `_app.conversas.tsx` / `.$id.tsx` → `sessions` + `messages` reais; ação "assumir conversa" (mode=human, assigned_to).
- `_app.triagens.tsx` / `.$id.tsx` → `travel_intake` real; mudar status, atribuir consultor.
- `_app.canal.tsx` → `channel_posts` real; aprovar/rejeitar rascunhos.
- `_app.configuracoes.tsx` → `channel_settings` (persona, horário, fora-de-horário).
- Realtime em `sessions` e `messages` para o painel atualizar sozinho.

Arquivos novos: `src/lib/dashboard.functions.ts`, `conversations.functions.ts`, `triages.functions.ts`, `posts.functions.ts`, `settings.functions.ts`.

### Etapa C — Webhook Descubra MS (instruções para você)

Como você tem acesso admin no Supabase do Descubra, vou te entregar:
1. SQL/configuração do **Database Webhook** no painel do Descubra MS:
   - URL: `https://guata-connect-hub.lovable.app/api/public/webhooks/descubra-ms`
   - Header: `Authorization: Bearer <DESCUBRA_WEBHOOK_SECRET>` (valor já está nos secrets)
   - Eventos: `INSERT` e `UPDATE` na tabela `events` (ou equivalente).
2. Teste end-to-end: criar evento de teste → ver aparecer como rascunho em `channel_posts` → aprovar no painel.

### Etapa D — Robustez 24/7

- **Cron job (`pg_cron`)**: backfill diário de eventos do Descubra (segurança, caso webhook falhe).
- **Cron job**: limpar sessões inativas > 30 dias.
- **Mensagem fora de horário**: pipeline já tem hook em `channel_settings.mensagem_fora_horario` — ligar a checagem.
- **Tratamento de falha Meta**: se `sendWhatsAppText` retornar erro, gravar em `messages.metadata.error` para reprocesso manual.
- **Logs**: confirmar que erros do pipeline aparecem em `server-function-logs`.

### Etapa E — Verificação final

1. `cloud_status` → garantir `ACTIVE_HEALTHY`.
2. `invoke-server-function` no webhook WhatsApp com payload de teste.
3. Mandar mensagem real para o número → ver no painel em tempo real.
4. Aprovar evento do Descubra como post.
5. **Publish**.

---

## Ordem de execução proposta

1. **Etapa B (painel real)** — não bloqueia em nada externo, dá visibilidade imediata.
2. **Etapa D (robustez)** — crons e fallbacks.
3. Te entrego em paralelo o **guia da Etapa A (Meta)** e o **guia da Etapa C (webhook Descubra)** para você executar do seu lado.
4. Quando você voltar com as credenciais Meta → adiciono os secrets e ativamos a Linha Descubra (Linha Viagens fica pronta para quando você tiver o 2º número).
5. **Etapa E** — testes + Publish.

## Riscos conhecidos

- **Meta Business Verification**: pode demorar dias. Enquanto isso, o número só envia para destinatários cadastrados como testers no App.
- **Janela 24h**: WhatsApp só permite mensagem livre dentro de 24h após o usuário escrever. Fora disso, exige **template aprovado**. Para o bot reativo não é problema; para notificações ativas sim — fica fora desta rodada.
- **Rate limit Lovable AI Gateway**: se atingirmos limite, o bot devolve mensagem de fallback amigável (já implementado no pipeline).
