import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Ban, MessageCircle, Trash2, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeadStageBadge, SessionModeBadge } from "@/components/guata/status-badge";
import { api } from "@/lib/api/client";
import { formatPhone, timeAgo, waLink } from "@/lib/format";
import type { Conversation } from "@/types/guata";

export function ConversationProfileCard({ conv }: { conv: Conversation }) {
  const display = conv.contactName ?? formatPhone(conv.phone);
  const initials = display.slice(0, 2).toUpperCase();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const optOut = useMutation({
    mutationFn: (active: boolean) => api.setDoNotContact(conv.id, active, "manual"),
    onSuccess: (_, active) => {
      toast.success(active ? "Marcado como Não contatar" : "Contato liberado");
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => api.deleteConversations([conv.id]),
    onSuccess: () => {
      toast.success("Contato excluído");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/conversas" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 flex flex-wrap gap-4 items-center">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-lg bg-primary/15 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-[200px] space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-lg">{display}</span>
            <SessionModeBadge mode={conv.mode} />
            {conv.leadStage && <LeadStageBadge stage={conv.leadStage} />}
            {conv.doNotContact && (
              <span className="text-[10px] uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Não contatar
              </span>
            )}
          </div>
          {conv.groupOfferNote && (
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              {conv.groupOfferNote}
            </p>
          )}
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            Cliente no WhatsApp · {formatPhone(conv.phone)}
          </p>
          {conv.createdAt && (
            <p className="text-xs text-muted-foreground">
              Primeiro contato {timeAgo(conv.createdAt)}
            </p>
          )}
          {conv.assignedToName && (
            <p className="text-xs font-medium text-primary">Atendido por: {conv.assignedToName}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={optOut.isPending}
              onClick={() => optOut.mutate(!conv.doNotContact)}
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              {conv.doNotContact ? "Liberar contato" : "Não contatar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={del.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Excluir este contato? Ele some do painel e não recebe campanhas/follow-up.",
                  )
                ) {
                  del.mutate();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Excluir
            </Button>
          </div>
        </div>
        <a
          href={waLink(conv.phone)}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
        >
          <MessageCircle className="h-4 w-4" />
          Abrir no WhatsApp
        </a>
      </CardContent>
    </Card>
  );
}
