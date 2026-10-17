import type { ChatMessage } from "@/types/guata";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export function ChatTimeline({ messages }: { messages: ChatMessage[] }) {
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
          m.role === "user" ? "Cliente" : m.role === "bot" ? "Guatá 🦫" : "Consultor";
        const showText =
          m.text &&
          !(
            m.mediaKind === "image" &&
            m.text.startsWith("(") &&
            m.text.includes("Cliente enviou")
          );
        return (
          <div key={m.id} className={cn("flex", align)}>
            <div className={cn("max-w-[78%] rounded-2xl px-4 py-2 shadow-sm space-y-2", bubble)}>
              <div className="text-xs font-medium opacity-70 mb-0.5">{label}</div>
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
                  <source src={m.mediaUrl} type={m.mediaMime ?? "audio/ogg"} />
                </audio>
              )}
              {showText && (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
              )}
              <div className="text-[10px] opacity-60 mt-1 text-right">
                {formatDateTime(m.at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
