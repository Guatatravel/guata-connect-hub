import type { ChatMessage } from "@/types/guata";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { FileText, Reply } from "lucide-react";

function DeliveryMark({
  status,
  hasWaId,
  error,
}: {
  status?: ChatMessage["deliveryStatus"];
  hasWaId: boolean;
  error?: string;
}) {
  if (status === "failed") {
    return (
      <span className="text-destructive" title={error || "A Meta não entregou"}>
        não entregue
      </span>
    );
  }
  const shown = status ?? (hasWaId ? "sent" : undefined);
  if (!shown) return null;
  const read = shown === "read";
  const delivered = shown === "delivered" || read;
  const label = read ? "Visualizada" : delivered ? "Entregue" : "Enviada";
  return (
    <span className={read ? "text-sky-600" : undefined} title={label}>
      {delivered ? "✓✓" : "✓"}
    </span>
  );
}

export function ChatTimeline({
  messages,
  onReply,
}: {
  messages: ChatMessage[];
  onReply?: (message: ChatMessage) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        const align = m.role === "user" ? "justify-start" : "justify-end";
        const bubble =
          m.role === "user"
            ? "bg-card border border-border text-foreground"
            : m.role === "bot"
              ? "bg-primary/10 border border-primary/20 text-foreground"
              : "bg-accent/40 border border-accent text-accent-foreground";
        const label =
          m.role === "user"
            ? "Cliente"
            : m.role === "bot"
              ? "Guatá 🦫"
              : m.authorName
                ? `${m.authorName} (Consultor)`
                : "Consultor";
        const showText =
          m.text &&
          !(
            (m.mediaKind === "image" &&
              m.text.startsWith("(") &&
              m.text.includes("Cliente enviou")) ||
            (m.mediaKind === "audio" && m.text === "[áudio]")
          );
        const voiceWithoutFile = m.outboundKind === "audio" && !m.mediaUrl;
        const mediaMissing = Boolean(m.mediaKind && !m.mediaUrl && m.outboundKind !== "audio");
        return (
          <div key={m.id} className={cn("flex", align)}>
            <div className={cn("max-w-[78%] rounded-2xl px-4 py-2 shadow-sm space-y-2", bubble)}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium opacity-70">{label}</div>
                {onReply && (
                  <button
                    type="button"
                    className="text-[11px] opacity-60 hover:opacity-100 inline-flex items-center gap-1"
                    title={
                      m.waMessageId
                        ? "Responder citando esta mensagem"
                        : "Mensagem antiga: o WhatsApp ainda não tem o id para citar"
                    }
                    onClick={() => onReply(m)}
                  >
                    <Reply className="h-3 w-3" />
                    Responder
                  </button>
                )}
              </div>
              {m.replyTo && (
                <div className="rounded-md border-l-2 border-primary/60 bg-background/60 px-2 py-1 text-xs">
                  <div className="font-medium opacity-80">{m.replyTo.authorLabel}</div>
                  <div className="line-clamp-2 whitespace-pre-wrap opacity-70">{m.replyTo.text}</div>
                </div>
              )}
              {m.mediaKind === "image" && m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={m.mediaUrl}
                    alt="Imagem"
                    className="rounded-lg max-h-64 w-auto object-contain"
                  />
                </a>
              )}
              {m.mediaKind === "audio" && m.mediaUrl && (
                <audio controls preload="metadata" className="w-full max-w-xs">
                  <source src={m.mediaUrl} type={m.mediaMime ?? "audio/mpeg"} />
                </audio>
              )}
              {m.mediaKind === "video" && m.mediaUrl && (
                <video controls preload="metadata" className="w-full max-w-xs rounded-lg" src={m.mediaUrl} />
              )}
              {voiceWithoutFile && (
                <div className="text-xs opacity-70">Áudio enviado no WhatsApp (arquivo anterior não ficou salvo).</div>
              )}
              {mediaMissing && (
                <div className="text-xs opacity-70">
                  {m.mediaKind === "image"
                    ? "Imagem"
                    : m.mediaKind === "document"
                      ? "Documento"
                      : m.mediaKind === "video"
                        ? "Vídeo"
                        : "Arquivo"}{" "}
                  enviado no WhatsApp (arquivo anterior não ficou salvo).
                </div>
              )}
              {m.mediaKind === "document" && m.mediaUrl && (
                <a
                  href={m.mediaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-primary underline underline-offset-2"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  {m.mediaFilename ?? "Abrir PDF / documento"}
                </a>
              )}
              {showText && (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
              )}
              <div className="text-[10px] opacity-60 mt-1 text-right flex items-center justify-end gap-1">
                <span>{formatDateTime(m.at)}</span>
                {m.role !== "user" && (
                  <DeliveryMark
                    status={m.deliveryStatus}
                    hasWaId={Boolean(m.waMessageId)}
                    error={m.deliveryError}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
