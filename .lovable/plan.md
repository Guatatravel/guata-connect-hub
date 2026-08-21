# Diagnóstico do Descubra MS + logo personalizável

Duas entregas: um painel de diagnóstico que testa de verdade a conexão com o Descubra MS, e a possibilidade de trocar a logo do portal.

## 1. Diagnóstico da integração Descubra MS

Hoje a tela de Configurações só mostra se os secrets existem — não prova que a conexão funciona. Vou adicionar um bloco "Testar conexão" que roda checagens reais e mostra o resultado em verde/amarelo/vermelho:

- **Banco Descubra**: consulta real de leitura (conta registros de eventos e da base de conhecimento `guata_knowledge_base`) e mostra quantos itens retornaram.
- **Persona do Guatá**: verifica se o prompt em `ai_prompt_configs` foi encontrado e exibe um trecho.
- **Webhook de eventos**: mostra o último post recebido do Descubra (data e título) ou avisa "nunca recebemos um evento".
- **WhatsApp (Meta)**: indica se os secrets estão presentes e qual foi a última mensagem recebida pelo webhook.
- **Botão "Enviar evento de teste"**: dispara um payload de teste no próprio webhook para confirmar ponta a ponta que um evento vira post na aba Canal (post marcado como teste, fácil de excluir).

Cada linha traz mensagem em português explicando o que fazer quando falha (ex.: "credencial inválida", "tabela não encontrada", "webhook nunca acionado").

## 2. Trocar a logo do portal

- Espaço de armazenamento de imagens no backend (bucket público `branding`).
- Em Configurações, novo cartão **Identidade visual**: pré-visualização da logo atual, botão de upload (PNG/SVG/JPG, até 2 MB), botão "Restaurar padrão".
- Só administradores podem trocar; consultores apenas veem.
- A logo aparece na barra lateral e na tela de login; enquanto não houver upload, segue o texto/ícone atual.

## Detalhes técnicos

- Nova server function `runDescubraDiagnostics` (e `sendTestDescubraEvent`) em `src/lib/*.functions.ts`, usando o cliente admin do Descubra já existente em `src/integrations/descubra/admin.server.ts`; nenhuma credencial é devolvida ao navegador, só status e contagens.
- Bucket Supabase Storage `branding` (leitura pública, escrita restrita a admin) + coluna/linha em `channel_settings` guardando a URL da logo.
- Sidebar e login passam a ler essa URL via React Query, com skeleton e fallback.
- Toasts de sucesso/erro em português, seguindo o padrão do painel.
