import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { SessionMode } from "@/types/guata";

/** Botões Assumir / Devolver ao Guatá + marca a conversa como vista ao abrir. */
export function HandoffControls({ sessionId, mode }: { sessionId: string; mode: SessionMode }) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["conversation", sessionId] });
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["unread-counts"] });
    qc.invalidateQueries({ queryKey: ["triage"] });
  };

  useEffect(() => {
    api.markConversationSeen(sessionId).then(() =>
      qc.invalidateQueries({ queryKey: ["unread-counts"] }),
    ).catch(() => {});
  }, [sessionId, qc]);

  const assume = useMutation({
    mutationFn: () => api.assumeConversation(sessionId),
    onSuccess: () => { toast.success("Você assumiu. O Guatá ficou em pausa."); refresh(); },
    onError: () => toast.error("Não foi possível assumir"),
  });
  const release = useMutation({
    mutationFn: () => api.releaseBot(sessionId),
    onSuccess: () => { toast.success("O Guatá voltou a responder este cliente."); refresh(); },
    onError: () => toast.error("Não foi possível devolver ao Guatá"),
  });

  const human = mode === "humano";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-secondary/30 p-3">
      <span className="text-sm text-muted-foreground flex-1 min-w-[200px]">
        {human
          ? "Você está atendendo. O Guatá está em pausa nesta conversa."
          : "O Guatá está respondendo este cliente automaticamente."}
      </span>
      {human ? (
        <Button size="sm" onClick={() => release.mutate()} disabled={release.isPending}>
          <Bot className="h-4 w-4 mr-1" /> Devolver para o Guatá
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => assume.mutate()} disabled={assume.isPending}>
          <UserRound className="h-4 w-4 mr-1" /> Assumir atendimento
        </Button>
      )}
    </div>
  );
}
