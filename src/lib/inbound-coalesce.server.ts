/**
 * Junta texto e áudio (já transcrito) do mesmo contato antes de chamar a IA.
 * Em serverless o Map vale por isolate — ainda cobre rajadas no mesmo processo.
 */
import type { IncomingMessage } from "@/lib/message-pipeline.server";

/** Espera após a última msg (texto ou áudio) para pegar complemento digitado. */
const WINDOW_MS = 10000;

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

/**
 * Texto e áudio entram na janela. Imagem/vídeo/documento/citação/referral: na hora.
 */
export function shouldCoalesceInbound(msg: IncomingMessage): boolean {
  if (msg.unsupportedAutoReply) return false;
  if (msg.quotedWaMessageId) return false;
  if (msg.referral) return false;
  const kind = msg.inboundKind ?? "text";
  if (kind === "text") {
    const t = msg.text.trim();
    if (!t) return false;
    return true;
  }
  if (kind === "audio") {
    // Inclui falha de transcrição — ainda pode vir texto em seguida.
    return Boolean(msg.text.trim());
  }
  return false;
}

function mergeMessages(batch: IncomingMessage[]): IncomingMessage {
  const last = batch[batch.length - 1]!;
  if (batch.length === 1) return last;

  const texts = batch.map((m) => m.text.trim()).filter(Boolean);
  const audioMsgs = batch.filter((m) => m.inboundKind === "audio");
  const lastAudio = audioMsgs[audioMsgs.length - 1];
  const hadAudio = audioMsgs.length > 0;

  // Preferir wamid do áudio para mark-as-played (microfone azul no WhatsApp).
  const audioMessageId =
    [...audioMsgs].reverse().find((m) => m.messageId)?.messageId ??
    [...batch].reverse().find((m) => m.messageId)?.messageId;

  return {
    ...last,
    text: texts.join("\n"),
    inboundKind: hadAudio ? "audio" : (last.inboundKind ?? "text"),
    messageId: audioMessageId ?? last.messageId,
    contactName: last.contactName ?? batch.find((m) => m.contactName)?.contactName,
    mediaPath: lastAudio?.mediaPath ?? last.mediaPath,
    mediaMime: lastAudio?.mediaMime ?? last.mediaMime,
    mediaKind: lastAudio?.mediaKind ?? (hadAudio ? "audio" : last.mediaKind),
    mediaFilename: lastAudio?.mediaFilename ?? last.mediaFilename,
  };
}

/**
 * Enfileira texto/áudio; após WINDOW_MS sem nova msg, processa o lote junto.
 * Outros tipos disparam flush do bucket e processam na hora.
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
      `[inbound-coalesce] ${k} juntou ${bucket.messages.length} msgs (${merged.inboundKind}):`,
      merged.text.slice(0, 160),
    );
  }
  void process(merged)
    .then((r) => bucket.waiters.forEach((w) => w.resolve(r)))
    .catch((e) => bucket.waiters.forEach((w) => w.reject(e)));
}

/** Só para testes. */
export function coalesceWindowMs(): number {
  return WINDOW_MS;
}
