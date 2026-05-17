import type { ChatMessage } from "@/types/guata";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export function ChatTimeline({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((m) => {
        const align =
          m.role === "user" ? "justify-start" : "justify-end";
        const bubble =
          m.role === "user"
            ? "bg-card border border-border text-foreground"
            : m.role === "bot"
              ? "bg-primary/10 border border-primary/20 text-foreground"
              : "bg-accent/40 border border-accent text-accent-foreground";
        const label =
          m.role === "user" ? "Cliente" : m.role === "bot" ? "Guatá 🦫" : "Consultor";
        return (
          <div key={m.id} className={cn("flex", align)}>
            <div className={cn("max-w-[78%] rounded-2xl px-4 py-2 shadow-sm", bubble)}>
              <div className="text-xs font-medium opacity-70 mb-0.5">{label}</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</div>
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