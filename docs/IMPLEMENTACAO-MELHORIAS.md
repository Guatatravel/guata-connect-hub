# Passo a passo — melhorias implementadas

## 1. Base de conhecimento

- [x] Campo de busca (título, preview, URL, palavras-chave) em `/conhecimento`
- [x] PDF com opção **Enviar PDF no WhatsApp** (upload + edição)
- [x] Envio automático como **documento** no pipeline (`sendWhatsAppDocument`)

## 2. Links repetidos

- [x] Histórico de URLs na sessão (`session-sent-urls.server.ts`)
- [x] Não reenvia link automático “Confira:” se já foi enviado
- [x] Instrução à IA para não repetir o mesmo link

## 3. Parceiros

- [x] **Aprovar e criar conta** em `/solicitacoes` (`provisionAccessRequest`)
- [x] Guia operacional em `docs/PAINEL-PARCEIROS.md`
- [x] Texto em Agências apontando para Solicitações

## 4. WhatsApp Meta

- [x] Passo a passo com links em `/conectar-meta` (`meta-setup-guide.ts`)
- [x] Owner/admin da org pode salvar canal (não só admin global)

## 5. Login

- [x] Botão mostrar/ocultar senha

## Deploy

1. Commit + push para `main`
2. Publish no Lovable
3. Testar: busca na base, PDF enviável, aprovar solicitação teste, login com olho, conectar Meta
