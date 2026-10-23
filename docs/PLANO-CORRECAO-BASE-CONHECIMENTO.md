# Plano de correção — base de conhecimento, PDF e links no WhatsApp

Contexto: mapa de Campo Grande, link da agência fora de contexto, bot diz que não envia PDF, upload confuso na aba Arquivo.

**Você (agora):** ajustar palavras-chave e desligar “envia link” em cadastros genéricos (site da agência, links amplos).  
**Desenvolvimento (próximo passo):** itens abaixo em ordem de prioridade.

---

## Fase 1 — Comportamento do bot (rápido, alto impacto)

### 1.1 Prompt da IA: PDF e arquivos

**Problema:** o modelo diz “não consigo enviar PDF” — não é verdade; o pipeline pode enviar documento depois da resposta.

**Correção:**

- Em `message-pipeline.server.ts` (`whatsappRules`), adicionar regras explícitas:
  - Nunca dizer que não pode enviar PDF, imagem ou link no WhatsApp por limitação da ferramenta.
  - Se o cliente pedir **mapa, PDF, arquivo, folheto**, responder em texto de forma útil e **não** inventar bloqueio; o sistema pode anexar o arquivo cadastrado em seguida.
  - Não citar link da **agência comercial** (`agenciaguata.com`, pacotes, orçamento) em pergunta **só informativa** (mapa, atração, roteiro MS).

### 1.2 Catálogo enviável no prompt

**Problema:** `listSendableKnowledgeForPrompt` lista PDFs, mas o texto só fala em **imagem** e `[[ENVIAR_MIDIA:ID]]`.

**Correção:**

- Separar no prompt: **imagens** → tag `[[ENVIAR_MIDIA:uuid]]`; **PDFs** → “o sistema envia o PDF automaticamente se houver item na base; não diga que é impossível”.
- Opcional: tag `[[ENVIAR_PDF:uuid]]` para o modelo pedir envio explícito (espelha mídia).

### 1.3 Link automático “Confira: …” (agência fora do assunto)

**Problema:** `pickSendableKnowledgeLink` pontua por termos genéricos (`campo`, `grande`, `turismo`) e dispara link comercial.

**Correção em `knowledge.server.ts` + pipeline:**

| Regra | Detalhe |
|--------|---------|
| Pedido de arquivo | Se a mensagem bater em `\b(mapa|pdf|arquivo|mandar|enviar|anexo|folheto)\b`, **não** chamar `pickSendableKnowledgeLink` (priorizar PDF/mídia). |
| Links comerciais | Campo opcional `send_keywords` obrigatório para link “enviável” **ou** `minScore` maior (ex.: 4) quando não há keyword explícita na frase do cliente. |
| Domínio agência | Não auto-enviar links cujo host seja `agenciaguata.com` (ou flag `is_commercial` no cadastro) em estágio lead **informacional**. |
| Já enviado | Manter `session-sent-urls` (já existe). |

**Sua parte (sem código):** link do site da agência → desligar “envia link” **ou** keywords só `pacote, orçamento, agência, contratar`.

---

## Fase 2 — Envio do PDF do mapa

### 2.1 Matching do mapa

**Problema:** título = nome de arquivo longo; conteúdo = lixo de OCR (números); sem keywords → score baixo.

**Correção:**

- Ao pedir mapa/PDF, **boost** em `pickSendableKnowledgeMedia`: se query tem `mapa` + (`campo grande` OU `cg`), preferir PDF com `whatsapp_sendable` cujo título ou keywords contenham `mapa`.
- Se **um único** PDF enviável na org e cliente pede “mapa”, permitir `minScore = 1` só nesse caso.

**Sua parte:** no item do mapa (edição): título amigável `Mapa turístico Campo Grande 2025`; keywords `mapa, campo grande, mapa turístico, cg`.

### 2.2 PDF só imagem (mapa escaneado)

**Problema:** extração de texto falha ou gera números; `status` pode ficar `erro` e `whatsapp_sendable` não grava no upload.

**Correção:**

- Se extração falhar mas o arquivo for `.pdf` e tiver `file_path` no storage, permitir `status: pronto` com `content` = descrição manual ou “Mapa turístico (PDF)” + manter enviável.
- Campo **descrição para a IA** na edição de PDF (como na aba imagem).

### 2.3 Meta / documento

- Confirmar `sendWhatsAppDocument` com URL assinada Supabase (já implementado).
- Log claro se Meta rejeitar (tamanho, MIME).
- Limite WhatsApp: documento até ~100 MB; mapa < 8 MB OK.

---

## Fase 3 — UX da aba Arquivo (o que você sentiu na tela)

### 3.1 Ordem do fluxo

**Problema:** ao clicar em “Escolher arquivo”, o `onChange` faz upload **imediato** — switch e keywords ficam inúteis se o usuário não configurou antes.

**Correção em `_app.conhecimento.tsx`:**

1. Botão **Escolher arquivo** → só guarda `File` em estado (preview do nome).
2. Campos **Título**, **Enviar PDF no WhatsApp**, **Palavras-chave**, **Legenda**.
3. Botão **Enviar para a base** → chama `addKnowledgeFileDoc` com tudo junto.

### 3.2 Título obrigatório (ou forte)

- Input **Título** visível antes do envio (default = nome do arquivo, editável).
- Lista e busca já usam título — mapa deixa de aparecer só como `mapa_turistico_...pdf-1.pdf`.

### 3.3 Edição de PDF existente

- Garantir bloco de edição (título, keywords, legenda, switch) para **todo** `source_type === arquivo` com `.pdf`, não só heurística no preview.

---

## Fase 4 — Testes de aceite

| # | Ação | Resultado esperado |
|---|------|-------------------|
| 1 | Cadastrar mapa com título + keywords + “enviar PDF” **antes** do upload | Badge verde; sem 0 B se arquivo OK |
| 2 | “tem o mapa de turismo de Campo Grande?” | Texto útil; **sem** link agenciaguata.com |
| 3 | “pode me mandar o mapa aqui?” | Texto **sem** “não consigo PDF”; PDF chega em seguida |
| 4 | Segunda pergunta igual | Sem repetir o mesmo link/PDF se já enviado |
| 5 | Link agência só com keyword `orçamento` | Link só quando cliente falar orçamento/pacote |

---

## Ordem sugerida de implementação (dev)

1. ~~Fase 3 (UX upload)~~ ✅  
2. ~~Fase 1.1 + 1.2 (prompt PDF)~~ ✅  
3. ~~Fase 1.3 (não link comercial em pedido de mapa)~~ ✅  
4. ~~Fase 2.1 + 2.2 (match mapa + PDF escaneado)~~ ✅  
5. ~~Filtros na lista (Links / PDFs / …)~~ ✅  
6. Fase 4 (testes no WhatsApp após Publish Lovable).

---

## Fora deste plano (opcional depois)

- OCR do mapa (visão) para melhorar busca sem keywords.
- Tipo “só consulta” vs “pode enviar no WhatsApp” por categoria na lista.
- Não incluir links comerciais no `sendableCatalog` do prompt para linha Descubra MS.

---

## Referência de arquivos

| Área | Arquivos |
|------|----------|
| Prompt / pipeline | `src/lib/message-pipeline.server.ts` |
| Score link/PDF | `src/lib/knowledge.server.ts` |
| URLs já enviadas | `src/lib/session-sent-urls.server.ts` |
| UI base | `src/routes/_app.conhecimento.tsx` |
| Documento WhatsApp | `src/lib/meta-send.server.ts` |
