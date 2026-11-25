import type { ChatMessage } from "@/types/guata";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { FileText, Forward, Pencil, Reply, SmilePlus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

const REACTION_PICKER = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** Negrito/itálico estilo WhatsApp (* e _). */
function whatsAppInlineMarkup(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const re = /\*([^*\n]+)\*|_([^_\n]+)_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) nodes.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2]) nodes.push(<em key={key++}>{match[2]}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}

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
    const detail = error?.trim() || "A Meta não entregou esta mensagem ao celular.";
    return (
      <span className="text-red-700 block text-left max-w-[220px]" title={detail}>
        não entregue
        <span className="block text-[10px] leading-tight opacity-90">{detail}</span>
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
  contactDisplayName,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onReact,
}: {
  messages: ChatMessage[];
  /** Nome no balão das mensagens do cliente (WhatsApp). */
  contactDisplayName?: string;
  onReply?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (message: ChatMessage) => void;
  /** Reagir no WhatsApp (emoji vazio remove a reação da equipe). */
  onReact?: (message: ChatMessage, emoji: string) => void;
}) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      {messages.map((m) => {
        const mine = m.role !== "user";
        const label =
          m.role === "user"
            ? contactDisplayName?.trim() || "Cliente"
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
        const canReact = Boolean(onReact && !m.deleted && m.waMessageId);
        const agentEmoji = m.reactions?.agent;
        const reactionEntries = Object.entries(m.reactions ?? {}).filter(([, e]) => e);
        return (
          <div key={m.id} className={cn("flex px-1", mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "relative max-w-[82%] px-2.5 pt-1 pb-1 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] space-y-1",
                mine
                  ? "rounded-lg rounded-tr-none bg-[#d9fdd3] text-[#111b21]"
                  : "rounded-lg rounded-tl-none bg-white text-[#111b21]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-medium text-[#075e54]">{label}</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {canReact && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] hover:text-[#111b21] inline-flex items-center gap-1"
                      title="Reagir no WhatsApp"
                      onClick={() => setPickerFor((cur) => (cur === m.id ? null : m.id))}
                    >
                      <SmilePlus className="h-3 w-3" />
                      Reagir
                    </button>
                  )}
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
              {pickerFor === m.id && canReact && (
                <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#e9edef] bg-white px-1.5 py-1 shadow-sm">
                  {REACTION_PICKER.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-base hover:bg-[#f0f2f5]",
                        agentEmoji === emoji && "bg-[#d9fdd3]",
                      )}
                      title={agentEmoji === emoji ? "Remover reação" : `Reagir com ${emoji}`}
                      onClick={() => {
                        onReact!(m, agentEmoji === emoji ? "" : emoji);
                        setPickerFor(null);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                  {agentEmoji && (
                    <button
                      type="button"
                      className="text-[10px] text-[#667781] px-1 hover:text-[#c62828]"
                      onClick={() => {
                        onReact!(m, "");
                        setPickerFor(null);
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              )}
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
                    "whitespace-pre-wrap text-[14.2px] leading-[19px] [overflow-wrap:anywhere]",
                    m.deleted && "italic text-[#667781]",
                  )}
                >
                  {mine ? whatsAppInlineMarkup(m.text) : m.text}
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
              {reactionEntries.length > 0 && (
                <div
                  className={cn(
                    "flex flex-wrap gap-1 -mt-0.5",
                    mine ? "justify-end" : "justify-start",
                  )}
                >
                  {reactionEntries.map(([actor, emoji]) => (
                    <button
                      key={`${actor}-${emoji}`}
                      type="button"
                      disabled={!canReact || actor !== "agent"}
                      className={cn(
                        "inline-flex items-center rounded-full border border-[#e9edef] bg-white px-1.5 py-0.5 text-sm shadow-sm",
                        canReact && actor === "agent" && "hover:bg-[#f0f2f5] cursor-pointer",
                      )}
                      title={
                        actor === "user"
                          ? "Reação do cliente"
                          : canReact
                            ? "Sua reação — clique para remover"
                            : "Reação da equipe"
                      }
                      onClick={() => {
                        if (canReact && actor === "agent") onReact!(m, "");
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
