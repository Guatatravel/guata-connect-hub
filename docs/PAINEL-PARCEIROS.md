# Parceiros e painel — fluxo operacional

## Para a agência parceira

1. Acesse **Criar conta da agência** em `/apresentacao#solicitar` (ou link no login).
2. Preencha nome, empresa, e-mail, **senha** e WhatsApp.
3. Entre no painel na hora — enquanto a Guatá não liberar, você vê **Aguardando liberação** (sem WhatsApp/IA).
4. Após a liberação, abra **Conectar WhatsApp** e siga o passo a passo da Meta.
5. Cadastre conteúdo em **Conhecimento e disparos**.
6. **Equipe (humanos)** — convide vendedores/consultores com login (owner/admin da agência).
7. **Atendente virtual (IA)** — ajuste tom e regras do bot (não é login humano).

## Para a equipe Guatá

1. **Solicitações** → revise o pedido (conta já existe na maioria dos casos).
2. Clique em **Liberar acesso** (ativa a agência no painel e o bot no WhatsApp).
3. Cadastros antigos **sem login** ainda geram senha temporária ao liberar — envie ao parceiro.
4. Ajude na Meta na tela **Conectar WhatsApp** (selecione a org no topo se for admin).
5. **Usuários (Guatá)** — admins globais; parceiros usam **Equipe** na própria agência.

## Papéis

| Papel | O que faz |
|-------|-----------|
| **Administrador** (sistema) | Usuários Guatá, solicitações, todas as orgs, WhatsApp de qualquer org |
| **Consultor** | Conversas, triagens, conhecimento da **org ativa** |
| **Owner/admin da org** | **Equipe**, **Conectar WhatsApp**, convites de consultores humanos |

## Implementação técnica (referência)

- Auto-cadastro: `registerPartnerAccount` → `registerPartnerSelfService`
- Liberação: `provisionAccessRequest` → `access_liberado` na org
- Equipe: `listOrgTeam` / `inviteOrgTeamMember` em `organizations.functions.ts`
- Bot: tabela `attendants` + rota `/atendentes`
