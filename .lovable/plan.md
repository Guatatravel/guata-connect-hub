# Plano — Notificações do Guatá Channel + correções na tela de Configurações

## Parte 1 — Sobre a tela de Configurações (o que você viu)

Aqueles campos que aparecem lá **não são para você editar** — são **URLs geradas pelo sistema** que você precisa **copiar e colar** em outros lugares:

- **Webhook WhatsApp** (`/api/public/webhooks/whatsapp`) → você copia essa URL e cola no painel da **Meta Developers** (Configurations → Webhooks). É por ali que a Meta manda as mensagens dos clientes pro nosso servidor.
- **Webhook Descubra MS** (`/api/public/webhooks/descubra-ms`) → você copia e cola no **Supabase do Descubra MS** (Database Webhooks). É por ali que novos eventos do Descubra chegam pra aparecer na aba "Canal".

Os campos são só-leitura de propósito — a URL é fixa e depende do endereço publicado. O que dá para editar é: persona do bot, horário, mensagens automáticas e serviços da agência.

### Auditoria (falhas encontradas sem rodar código)

Analisando o código atual, encontrei estes pontos que precisam de atenção:

1. **URL do webhook usa `window.location.origin`** — se você abrir a Configurações no preview (`id-preview--...lovable.app`), ela mostra a URL do preview, não da publicada. Precisa fixar sempre a URL publicada estável (`guata-connect-hub.lovable.app` ou `project--{id}.lovable.app`) para você não colar a errada na Meta.
2. **Status "Linha Viagens" sempre vai aparecer vermelho** — só está configurado `META_PHONE_NUMBER_ID_DESCUBRA` e `META_ACCESS_TOKEN_DESCUBRA`. Se você só vai usar uma linha por enquanto, isso é normal, mas o painel devia deixar claro "não configurado ainda" ao invés de parecer um erro.
3. **Falta um botão "Testar webhook"** — hoje só descobre se a Meta está conectada mandando uma mensagem de verdade.
4. **Falta um painel de "Últimas mensagens recebidas do webhook"** — útil pra debugar se a Meta está entregando. Hoje se algo não chega você fica no escuro.
5. **Falta indicador visual do que é "só-leitura vs editável"** — os inputs de webhook parecem editáveis mas não são.

## Parte 2 — Notificações: comparação e recomendação

| Opção | Quando aparece | Precisa navegador aberto? | Custo | Esforço |
|---|---|---|---|---|
| 1. Badge no menu lateral | Painel aberto | Sim | 0 | Baixo |
| 2. Toast + som | Painel aberto (qualquer aba) | Sim | 0 | Baixo |
| 3. Web Push (notificação do SO) | Sempre, mesmo painel fechado | Não (só precisa ter permitido 1x) | 0 | Médio |
| 4. E-mail | Sempre | Não | ~grátis (Lovable Email) | Médio |
| 5. WhatsApp pro seu número | Sempre | Não | Gasta mensagem Meta | Baixo |

### Recomendação: opções 1 + 2 + 4

Cobrem 95% dos casos sem depender do navegador estar aberto:

- **Badge + toast/som**: quando você está trabalhando no painel, vê chegar em tempo real.
- **E-mail**: quando você está longe do painel (fim de semana, à noite, celular), recebe aviso e abre quando puder.

Deixaria **Web Push (3)** e **WhatsApp (5)** para uma segunda fase se sentir necessidade. Web Push tem a chatice de o navegador ficar pedindo permissão e às vezes o sistema operacional bloquear.

## Parte 3 — O que vou implementar

### A. Corrigir a tela de Configurações
- Fixar URL publicada estável nos campos de webhook (não usar `window.location.origin`).
- Adicionar aviso "URL só-leitura — copie e cole no painel externo" acima dos campos.
- Trocar "Não configurado" (vermelho) por "Linha não usada" (cinza) quando a linha Viagens não tem secret.
- Adicionar seção "Últimas 10 mensagens recebidas via webhook" (debug) — só admin vê.
- Botão "Ver logs do webhook Meta" abrindo os logs do servidor.

### B. Notificações in-app (badge + toast + som)
- Habilitar Realtime nas tabelas `travel_intake` e `sessions`.
- Badge vermelho na sidebar em "Triagens" e "Conversas" com contador de itens aguardando.
- Toast + som suave quando chega nova triagem ou cliente pede humano (qualquer aba do painel).
- Toggle "silenciar som" nas Configurações.

### C. Notificações por e-mail
- Trigger: quando `travel_intake.status = 'novo'` é inserida, envia e-mail para todos usuários com role `admin` e `consultor`.
- Trigger: quando `session.mode` muda para `humano` (cliente pediu atendente), mesmo destino.
- Corpo do e-mail em português BR com link direto para a triagem/conversa.
- Configura via Lovable Email (usa domínio padrão até você conectar um custom).
- Seção nas Configurações: cada usuário liga/desliga suas próprias notificações por e-mail.

## Detalhes técnicos (para referência)

- **Realtime**: `ALTER PUBLICATION supabase_realtime ADD TABLE travel_intake, sessions, messages;` + subscribe no client em `useEffect`.
- **Badge**: hook `useUnreadCounts()` que combina query inicial + realtime subscription.
- **E-mail**: server function acionada por trigger PostgreSQL, chamando Lovable Email (Resend).
- **URL estável**: usar `project--{project-id}.lovable.app` em vez de `window.location.origin`.
- **Preferências de notificação**: nova tabela `user_notification_prefs (user_id, email_new_triage bool, email_human_request bool, sound_enabled bool)`.

## Ordem de execução

1. Corrigir tela de Configurações (rápido, 10 min).
2. Habilitar Realtime + badges + toasts + som (30 min).
3. Sistema de e-mail com preferências por usuário (45 min).

Se aprovar, começo pela parte 1 (correção da tela) e sigo direto para as 2 e 3.
