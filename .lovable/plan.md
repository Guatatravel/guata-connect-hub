# Por que o WhatsApp não responde — diagnóstico e plano

## O que eu verifiquei agora

- O endereço que a Meta usa para entregar mensagens está no ar e respondendo (ele recusa corretamente um token errado).
- O banco está **vazio**: 0 conversas, 0 mensagens, 0 triagens. Ou seja, **nenhuma mensagem da Meta chegou até hoje**.
- As chaves cadastradas: token de acesso, ID do número, segredo do app, token de verificação, além das chaves do Descubra MS.

Conclusão: o problema não é o painel nem o cérebro do bot — é a ligação com a Meta. Nada está entrando.

## As 3 causas mais prováveis (nesta ordem)

1. **A assinatura do webhook não confere.** Cada entrega da Meta vem assinada com o "segredo do app". Se esse segredo for de outro app (ou tiver espaço/caractere sobrando), o sistema recusa **todas** as entregas em silêncio — nada é gravado, nada aparece.
2. **O webhook não está inscrito no campo `messages`.** É comum salvar a URL, verificar com sucesso e esquecer de marcar a assinatura do campo `messages` no produto WhatsApp.
3. **O token de acesso é temporário (24 h).** Se foi copiado da tela de teste da Meta, já expirou — nesse caso o bot até entenderia a mensagem, mas não conseguiria responder.

Hoje não temos como saber qual das três é, porque o sistema descarta tudo sem deixar rastro. É isso que o plano resolve primeiro.

## O que vou construir

### 1. Caixa de entrada bruta (registro de tudo que chega)
Nova tabela que grava **toda** entrega recebida no endereço do WhatsApp — inclusive as recusadas — com data, se a assinatura conferiu, e o conteúdo. A partir daí, qualquer teste seu no celular passa a ser visível.

### 2. Página "Diagnóstico WhatsApp" (dentro de Configurações)
Uma tela que mostra, em português e sem termos técnicos:
- Se a Meta já entregou alguma coisa e quando foi a última;
- Se as assinaturas estão conferindo (e alerta claro caso não estejam);
- Se o token de acesso está válido e se é permanente ou expira — consultando a Meta na hora;
- Qual número está conectado e o status de qualidade dele;
- Botão **"Enviar mensagem de teste"** para um número que você digitar, mostrando a resposta exata da Meta em caso de erro.

### 3. Correções no recebimento
- Gravar a entrega antes de processar e responder rápido (a Meta reenvia se demorar), evitando mensagens perdidas ou duplicadas.
- Ignorar entregas repetidas pelo identificador da mensagem.
- Registrar também os avisos de entrega/leitura/falha que a Meta manda sobre as mensagens que o bot enviou — hoje eles são descartados.
- Tratar a segunda linha (Guatá Viagens) só quando ela for configurada, sem misturar com a linha Descubra.

### 4. Guia de conferência na tela
Um passo a passo curto na própria página, com a URL exata para colar na Meta e a lista do que precisa estar marcado, para você comparar com o que está lá.

## Detalhes técnicos

- Migração: tabela `whatsapp_deliveries` (payload, assinatura ok, headers, data, processado) com RLS restrita à equipe; índice por data.
- `src/routes/api/public/webhooks/whatsapp.ts`: grava a entrega antes da verificação de assinatura, responde 200 imediatamente, processa mensagens e `statuses`, deduplica por `message.id`.
- Novo `src/lib/whatsapp-diagnostics.server.ts` + `.functions.ts` (protegidos por `requireSupabaseAuth` + checagem de staff): consulta `GET /{phone-number-id}` e `GET /debug_token` na Graph API, lê as últimas entregas, envia mensagem de teste via `sendWhatsAppText` retornando o erro cru da Meta.
- Novo card/rota de diagnóstico reutilizando o padrão de `_app.configuracoes.tsx` (React Query, skeletons, toasts pt-BR).

## Depois disso

Com a caixa de entrada gravando, você manda uma mensagem do celular e em segundos a tela dirá exatamente onde está parando — ou a conversa aparecerá normalmente na aba Conversas.
