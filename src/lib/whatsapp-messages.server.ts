/**
 * Formatação e divisão de texto para envio no WhatsApp (bot e consultor).
 */

/** Limite por balão (Meta aceita até 4096; margem de segurança). */
export const WHATSAPP_BUBBLE_MAX = 3800;

/** Máximo de balões seguidos por resposta (evita spam; raro atingir). */
export const WHATSAPP_BUBBLE_MAX_COUNT = 12;

export function formatForWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Quebra trecho longo em palavras, sem cortar no meio. */
function splitOversizedChunk(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut < Math.floor(max * 0.4)) cut = max;
    const piece = rest.slice(0, cut).trim();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Divide texto longo em vários balões (parágrafos / linhas).
 */
export function splitWhatsAppMessages(text: string): string[] {
  const cleaned = formatForWhatsApp(text);
  if (!cleaned) return [];

  if (cleaned.length <= WHATSAPP_BUBBLE_MAX) return [cleaned];

  const bubbles: string[] = [];
  let current = "";

  const flush = () => {
    const t = current.trim();
    if (t) bubbles.push(t);
    current = "";
  };

  const appendChunk = (chunk: string) => {
    const part = chunk.trim();
    if (!part) return;
    if (part.length > WHATSAPP_BUBBLE_MAX) {
      for (const piece of splitOversizedChunk(part, WHATSAPP_BUBBLE_MAX)) {
        appendChunk(piece);
      }
      return;
    }
    const joiner = current ? "\n\n" : "";
    if ((current + joiner + part).length > WHATSAPP_BUBBLE_MAX) {
      flush();
      current = part;
    } else {
      current = current ? current + "\n\n" + part : part;
    }
  };

  for (const para of cleaned.split(/\n\n+/)) {
    for (const line of para.split(/\n/)) {
      appendChunk(line);
    }
  }
  flush();

  if (bubbles.length <= WHATSAPP_BUBBLE_MAX_COUNT) {
    return bubbles.length ? bubbles : [cleaned.slice(0, WHATSAPP_BUBBLE_MAX)];
  }

  const out = bubbles.slice(0, WHATSAPP_BUBBLE_MAX_COUNT);
  const last = out[out.length - 1];
  if (last && !last.endsWith("?")) {
    out[out.length - 1] = `${last}\n\nPosso continuar com mais detalhes se quiser.`;
  }
  return out;
}

/** Texto(s) para o cliente ver quem atende (primeiro balão assinado). */
export function agentWhatsAppParts(staffName: string | null, body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const parts = splitWhatsAppMessages(trimmed);
  if (parts.length === 0) return [];
  const firstName = staffName?.trim().split(/\s+/)[0] || "Consultor";
  return parts.map((p, i) => (i === 0 ? `*${firstName}* · Guatá:\n${p}` : p));
}

/** Legenda de mídia com assinatura do consultor. */
export function agentWhatsAppCaption(staffName: string | null, caption: string): string {
  const trimmed = caption.trim();
  if (!trimmed) return "";
  const parts = agentWhatsAppParts(staffName, trimmed);
  return parts[0] ?? trimmed;
}
