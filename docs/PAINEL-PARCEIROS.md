# Parceiros e painel — fluxo operacional

## Para a agência parceira

1. Acesse **Solicitar cadastro** em `/apresentacao#solicitar` (ou link no login).
2. Preencha nome, empresa, e-mail e WhatsApp.
3. Aguarde a Guatá **liberar** a solicitação.
4. Entre em **Guatá Channel** (`/login`) com o e-mail informado e a senha enviada pela equipe.
5. No primeiro acesso, **troque a senha** se o sistema pedir.
6. Abra **Conectar WhatsApp** e siga o passo a passo da Meta (links na página).
7. Cadastre conteúdo em **Conhecimento e disparos**.

## Para a equipe Guatá

1. **Solicitações** → revise o pedido.
2. Clique em **Aprovar e criar conta** (cria organização + usuário consultor + vínculo owner).
3. Copie a **senha temporária** e envie ao parceiro (WhatsApp/e-mail).
4. O parceiro conecta o WhatsApp na Meta; você pode ajudar na mesma tela **Conectar WhatsApp** (selecionando a org no topo).

## Papéis

| Papel | O que faz |
|-------|-----------|
| **Administrador** (sistema) | Usuários, solicitações, todas as orgs, WhatsApp de qualquer org |
| **Consultor** | Conversas, triagens, conhecimento da org ativa |
| **Owner/admin da org** | Pode salvar **Conectar WhatsApp** da própria agência |

## Implementação técnica (referência)

- Provisionamento: `provisionAccessRequest` → `access-provision.server.ts`
- Permissão WhatsApp: `userCanManageOrgWhatsApp`
- Anti-link repetido: `session-sent-urls.server.ts` + `pickSendableKnowledgeLink`
