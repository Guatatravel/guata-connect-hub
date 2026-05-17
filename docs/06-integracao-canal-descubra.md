# Integração Canal — Descubra MS

Posts na página **Canal** do painel são criados quando o **Supabase do Descubra** notifica a API ao publicar um evento.

## O que já está pronto

| Componente | Repo |
|------------|------|
| Webhook `POST /webhooks/descubra-ms` | `guata-channel-api` |
| Aceita payload Supabase Database Webhook + formato `event.published` | idem |
| Lista posts no painel | `guata-connect-hub` |

## O que você configura no Supabase Descubra

1. **Database → Webhooks → Create**
2. Tabela `events`, eventos **Insert** e **Update**
3. URL: valor de `webhookDescubraUrl` em **Configurações** do painel (ou `PUBLIC_API_BASE_URL` + `/webhooks/descubra-ms`)
4. Header: `Authorization: Bearer <DESCUBRA_WEBHOOK_SECRET>`

Passo a passo completo: `../guata-channel-api/integrations/descubra-ms/README.md`

## Por que um evento do site não apareceu sozinho?

- O evento já estava publicado **antes** do webhook existir → republicar o evento ou chamar o webhook manualmente.
- O webhook ainda não foi criado no Supabase Descubra.
- Em local, o Supabase não alcança `localhost` (use ngrok).

## Não é importação em lote

Não há botão “sincronizar todos os eventos”. Cada publicação dispara **um** post de Canal.
