
# Plano de ação — Ativar Guatá Channel 24/7

## O que eu já vejo nas suas credenciais (print da Meta)

Da tela "Configuração da API" do seu App Meta:
- **Phone Number ID (Descubra)**: `1043833208824290`
- **WhatsApp Business Account ID**: `3421874141319363`
- **Número**: `+55 67 9131-7630`
- **Access Token**: precisa clicar em **"Gerar token de acesso"** e copiar (token temporário de 24h serve para teste; depois trocamos por **token permanente de System User** para 24/7).

Faltam você me passar (pelo formulário seguro de secrets, não pelo chat):
- `META_ACCESS_TOKEN_DESCUBRA` (o que aparecer no botão "Gerar token de acesso")
- `META_APP_SECRET` (em **Configurações do App → Básico → Chave Secreta do App**)
- `META_VERIFY_TOKEN` (você inventa uma string aleatória, ex.: `guata-verify-2026-xyz`. Vai usar a MESMA na Meta e aqui)

`META_PHONE_NUMBER_ID_DESCUBRA` (`1043833208824290`) eu já preencho direto no secret.

---

## Etapa 1 — Reset da sua senha do painel Guatá Channel

Você acabou de chegar em `/login`. Vou:
1. Garantir que a rota `/trocar-senha` (já existe no projeto) aceite o fluxo `type=recovery` do Supabase.
2. Adicionar link **"Esqueci minha senha"** na tela de login que dispara `supabase.auth.resetPasswordForEmail(email, { redirectTo: <published_url>/trocar-senha })`.
3. Você recebe e-mail → clica → define nova senha → entra no painel.

Alternativa rápida (se preferir): você me diz o e-mail e eu gero um **link mágico de recuperação** direto via admin API server-side (1 clique, sem e-mail). Me diga qual prefere.

---

## Etapa 2 — Cadastrar os secrets da Meta

Vou abrir o formulário seguro pedindo:
- `META_APP_SECRET`
- `META_VERIFY_TOKEN` (você escolhe — anote, vai precisar colar na Meta também)
- `META_ACCESS_TOKEN_DESCUBRA`
- `META_PHONE_NUMBER_ID_DESCUBRA` → já sei: `1043833208824290`

Como o token "Gerar token de acesso" expira em 24h, em paralelo te entrego o **guia de System User** (Business Manager → Configurações → Usuários do sistema → criar admin "guata-bot" → gerar token **sem expiração** com permissões `whatsapp_business_messaging` e `whatsapp_business_management` → atribuir o ativo do WhatsApp). Esse vira o token definitivo 24/7.

---

## Etapa 3 — Configurar o Webhook na Meta

No mesmo App, na seção **WhatsApp → Configuração** (logo abaixo de "Configuração da API"):

- **URL de callback**:
  `https://guata-connect-hub.lovable.app/api/public/webhooks/whatsapp`
- **Token de verificação**: o mesmo `META_VERIFY_TOKEN` que você escolheu.
- Clicar **Verificar e salvar** → Meta faz GET handshake → nosso código responde 200.
- **Inscrever campos**: marcar `messages`.

Pré-requisito: precisamos clicar em **Publish** no Lovable ANTES desse passo, senão a URL `guata-connect-hub.lovable.app` ainda não está no ar com o código mais recente.

---

## Etapa 4 — Publish + teste end-to-end

1. **Publish** no Lovable (botão no topo).
2. Cadastrar seu próprio WhatsApp como **destinatário de teste** na Meta (enquanto a verificação Business não termina, só números cadastrados recebem).
3. Mandar "oi" do seu WhatsApp para `+55 67 9131-7630`.
4. Conferir no painel `/conversas` em tempo real.
5. Bot responde com o menu → testar "2" para disparar triagem de viagem → ver protocolo em `/triagens`.

---

## Etapa 5 — Webhook do Descubra MS (paralelo)

Depois do WhatsApp funcionando, te entrego o passo-a-passo de **Database Webhook** no Supabase do Descubra MS apontando para:
- URL: `https://guata-connect-hub.lovable.app/api/public/webhooks/descubra-ms`
- Header: `Authorization: Bearer <DESCUBRA_WEBHOOK_SECRET>`
- Eventos: INSERT/UPDATE em `events`

---

## Resumindo o que estamos construindo (recap)

**Guatá Channel** = central operacional de WhatsApp do ecossistema **Descubra MS**, rodando 24/7 no servidor da Lovable (depende só do **Publish**, não do seu computador). Duas linhas:
1. **Descubra MS** — bot turístico institucional (KB + eventos + publicação no canal).
2. **Viagens MS** — bot de triagem de pacotes (origem/destino/datas/pax/orçamento → protocolo → consultor).

Banco operacional: **Lovable Cloud** (sua conta Lovable, acessível pelo botão "View Backend"). Banco do Descubra: **seu Supabase próprio**, só leitura.

---

## Pergunta antes de eu executar

1. **Reset de senha**: prefere fluxo de e-mail ("Esqueci minha senha" no login) ou link mágico direto que eu gero pra um e-mail específico?
2. Confirma que posso já abrir o formulário de secrets pedindo os 3 campos da Meta (`META_APP_SECRET`, `META_VERIFY_TOKEN` que você escolher, `META_ACCESS_TOKEN_DESCUBRA`)?
