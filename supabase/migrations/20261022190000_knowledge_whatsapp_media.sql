-- Mídias enviáveis no WhatsApp a partir da base de conhecimento.

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS whatsapp_sendable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whatsapp_caption text;
