/**
 * Junta mensagens de texto rápidas do mesmo contato antes de chamar a IA.
 * Em serverless o Map vale por isolate — ainda cobre rajadas no mesmo processo.
 */
import type { IncomingMessage } from "@/lib/message-pipeline.server";

const WINDOW_MS = 1600;

type Bucket = {
  messages: IncomingMessage[];
  timer: ReturnType<typeof setTimeout>;
  waiters: Array<{
    resolve: (v: { replies: string[]; sessionId: string }) => void;
    reject: (e: unknown) => void;
  }>;
};

const buckets = new Map<string, Bucket>();

function keyOf(msg: IncomingMessage): string {
  return `${msg.organizationId}:${msg.line}:${msg.phone}`;
}

/** Mídia, formato especial ou citação: processa na hora (não junta). */
export function shouldCoalesceInbound(msg: IncomingMessage): boolean {
  if (msg.unsupportedAutoReply) return false;
  if (msg.inboundKind && msg.inboundKind !== "text") return false;
  if (msg.mediaPath || msg.mediaKind) return false;
  if (msg.quotedWaMessageId) return false;
  if (msg.referral) return false;
  const t = msg.text.trim();
  if (!t) return false;
  // Placeholders internos de mídia — não misturar
  if (t.startsWith("(Áudio") || t.startsWith("(Cliente enviou") || t.startsWith("(Sistema:")) return false;
  return true;
}

function mergeMessages(batch: IncomingMessage[]): IncomingMessage {
  const last = batch[batch.length - 1]!;
  if (batch.length === 1) return last;
  const texts = batch.map((m) => m.text.trim()).filter(Boolean);
  return {
    ...last,
    text: texts.join("\n"),
    messageId: last.messageId ?? batch.find((m) => m.messageId)?.messageId,
    contactName: last.contactName ?? batch.find((m) => m.contactName)?.contactName,
  };
}

/**
 * Enfileira e, após WINDOW_MS sem nova mensagem de texto, processa o lote junto.
 * Mensagens que não devem coalesce disparam flush imediato do bucket anterior e processam na hora.
 */
export function enqueueInboundMessage(
  msg: IncomingMessage,
  process: (msg: IncomingMessage) => Promise<{ replies: string[]; sessionId: string }>,
): Promise<{ replies: string[]; sessionId: string }> {
  if (!shouldCoalesceInbound(msg)) {
    const k = keyOf(msg);
    const existing = buckets.get(k);
    if (existing) {
      clearTimeout(existing.timer);
      buckets.delete(k);
      const merged = mergeMessages(existing.messages);
      const waiters = existing.waiters;
      void process(merged)
        .then((r) => waiters.forEach((w) => w.resolve(r)))
        .catch((e) => waiters.forEach((w) => w.reject(e)));
    }
    return process(msg);
  }

  const k = keyOf(msg);
  return new Promise((resolve, reject) => {
    const existing = buckets.get(k);
    if (existing) {
      existing.messages.push(msg);
      existing.waiters.push({ resolve, reject });
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => flush(k, process), WINDOW_MS);
      return;
    }
    const bucket: Bucket = {
      messages: [msg],
      waiters: [{ resolve, reject }],
      timer: setTimeout(() => flush(k, process), WINDOW_MS),
    };
    buckets.set(k, bucket);
  });
}

function flush(
  k: string,
  process: (msg: IncomingMessage) => Promise<{ replies: string[]; sessionId: string }>,
): void {
  const bucket = buckets.get(k);
  if (!bucket) return;
  buckets.delete(k);
  const merged = mergeMessages(bucket.messages);
  if (bucket.messages.length > 1) {
    console.info(
      `[inbound-coalesce] ${k} juntou ${bucket.messages.length} mensagens:`,
      merged.text.slice(0, 120),
    );
  }
  void process(merged)
    .then((r) => bucket.waiters.forEach((w) => w.resolve(r)))
    .catch((e) => bucket.waiters.forEach((w) => w.reject(e)));
}
