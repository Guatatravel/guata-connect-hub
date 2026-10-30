import type { ChatMessage } from "@/types/guata";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { FileText, Forward, Pencil, Reply, Trash2 } from "lucide-react";

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
      <span className="text-red-700" title={error || "A Meta não entregou"}>
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
    <span className={read ? "text-[#53bdeb]" : "text-[#667781]"} title={label}>
      {delivered ? "✓✓" : "✓"}
    </span>
  );
}

export function ChatTimeline({
  messages,
  onReply,
  onForward,
  onEdit,
  onDelete,
}: {
  messages: ChatMessage[];
  onReply?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {messages.map((m) => {
        const mine = m.role !== "user";
        const label =
          m.role === "user"
            ? "Cliente"
            : m.role === "bot"
              ? "Guatá"
              : m.authorName
                ? m.authorName
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
        const canRevoke =
          mine && !m.deleted && Boolean(m.waMessageId) && (onEdit || onDelete);
        const canEditText =
          canRevoke &&
          onEdit &&
          !m.mediaKind &&
          showText &&
          m.text !== "Mensagem apagada";
        return (
          <div key={m.id} className={cn("flex px-1", mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[82%] px-2.5 pt-1 pb-1 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] space-y-1",
                mine
                  ? "rounded-lg rounded-tr-none bg-[#d9fdd3] text-[#111b21]"
                  : "rounded-lg rounded-tl-none bg-white text-[#111b21]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium text-[#075e54]">{label}</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {onForward &&
                    !m.deleted &&
                    (m.mediaUrl || (m.text && m.text !== "[áudio]" && m.text !== "Mensagem apagada")) && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] hover:text-[#111b21] inline-flex items-center gap-1"
                      title="Enviar esta mensagem para outra pessoa"
                      onClick={() => onForward(m)}
                    >
                      <Forward className="h-3 w-3" />
                      Encaminhar
                    </button>
                  )}
                  {canEditText && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] hover:text-[#111b21] inline-flex items-center gap-1"
                      title="Editar texto no WhatsApp (até 15 min)"
                      onClick={() => onEdit!(m)}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  )}
                  {canRevoke && onDelete && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] hover:text-[#c62828] inline-flex items-center gap-1"
                      title="Apagar para todos no WhatsApp"
                      onClick={() => onDelete(m)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Apagar
                    </button>
                  )}
                  {onReply && !m.deleted && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] hover:text-[#111b21] inline-flex items-center gap-1"
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
              </div>
              {m.replyTo && (
                <div className="rounded border-l-4 border-[#25d366] bg-black/5 px-2 py-1 text-xs">
                  <div className="font-medium text-[#075e54]">{m.replyTo.authorLabel}</div>
                  <div className="line-clamp-2 whitespace-pre-wrap text-[#667781]">{m.replyTo.text}</div>
                </div>
              )}
              {m.mediaKind === "image" && m.mediaUrl && (
                <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={m.mediaUrl}
                    alt="Imagem"
                    className="rounded-md max-h-64 w-auto object-contain"
                  />
                </a>
              )}
              {m.mediaKind === "audio" && m.mediaUrl && (
                <audio controls preload="metadata" className="w-full max-w-xs">
                  <source src={m.mediaUrl} type={m.mediaMime ?? "audio/mpeg"} />
                </audio>
              )}
              {m.mediaKind === "video" && m.mediaUrl && (
                <video controls preload="metadata" className="w-full max-w-xs rounded-md" src={m.mediaUrl} />
              )}
              {voiceWithoutFile && (
                <div className="text-xs text-[#667781]">Áudio enviado no WhatsApp (arquivo anterior não ficou salvo).</div>
              )}
              {mediaMissing && (
                <div className="text-xs text-[#667781]">
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
                  className="flex items-center gap-2 text-sm text-[#027eb5]"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  {m.mediaFilename ?? "PDF / documento"}
                </a>
              )}
              {showText && (
                <div
                  className={cn(
                    "whitespace-pre-wrap text-[14.2px] leading-[19px]",
                    m.deleted && "italic text-[#667781]",
                  )}
                >
                  {m.text}
                  {m.edited && !m.deleted ? (
                    <span className="text-[11px] text-[#667781]"> · editada</span>
                  ) : null}
                </div>
              )}
              <div className="text-[11px] text-[#667781] mt-0.5 text-right flex items-center justify-end gap-1">
                <span>{formatTime(m.at)}</span>
                {mine && (
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
