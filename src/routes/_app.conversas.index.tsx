import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, BellRing, Search } from "lucide-react";
import { api } from "@/lib/api/client";
import { SessionModeBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, timeAgo } from "@/lib/format";
import type { Conversation } from "@/types/guata";

export const Route = createFileRoute("/_app/conversas/")({
  head: () => ({ meta: [{ title: "Conversas — Guatá Channel" }] }),
  component: ConversasPage,
});

function ConversasPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"ativas" | "arquivadas">("ativas");
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    refetchInterval: 8000,
  });
  const archive = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) => api.setArchived(v.id, v.archived),
    onSuccess: (_, v) => {
      toast.success(v.archived ? "Conversa arquivada" : "Conversa restaurada");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Não foi possível atualizar"),
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (term) {
        return (c.contactName ?? "").toLowerCase().includes(term) || c.phone.includes(term.replace(/\D/g, "") || "§");
      }
      return tab === "arquivadas" ? c.archived : !c.archived;
    });
  }, [data, q, tab]);
  const waiting = list.filter((c) => c.mode === "humano" && !c.archived);
  const others = list.filter((c) => !(c.mode === "humano" && !c.archived));

  const Row = ({ c }: { c: Conversation }) => (
    <div className="flex items-center gap-3 p-4 hover:bg-secondary/40 transition">
      <Link to="/conversas/$id" params={{ id: c.id }} className="flex flex-1 items-center gap-3 min-w-0">
        <div className="relative h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">
          {(c.contactName ?? c.phone).slice(0, 2).toUpperCase()}
          {c.unseen && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{c.contactName ?? formatPhone(c.phone)}</span>
            <LineBadge line={c.line} />
            <SessionModeBadge mode={c.mode} />
          </div>
          <div className="text-sm text-muted-foreground truncate">{c.lastMessage}</div>
        </div>
        <div className="text-xs text-muted-foreground">{timeAgo(c.lastMessageAt)}</div>
      </Link>
      <Button
        size="icon"
        variant="ghost"
        title={c.archived ? "Restaurar" : "Arquivar"}
        onClick={() => archive.mutate({ id: c.id, archived: !c.archived })}
      >
        {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">Conversas</h1>
        <p className="text-muted-foreground">
          Arquive para limpar a lista — o histórico fica guardado e volta sozinho se o cliente escrever de novo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou telefone (inclui arquivadas)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant={tab === "ativas" ? "default" : "outline"} size="sm" onClick={() => setTab("ativas")}>Ativas</Button>
        <Button variant={tab === "arquivadas" ? "default" : "outline"} size="sm" onClick={() => setTab("arquivadas")}>Arquivadas</Button>
      </div>

      {isLoading ? (
        <Card className="rounded-2xl p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </Card>
      ) : (
        <>
          {waiting.length > 0 && (
            <Card className="rounded-2xl overflow-hidden border-destructive/50">
              <div className="flex items-center gap-2 px-4 py-3 bg-destructive/10 text-destructive font-medium">
                <BellRing className="h-4 w-4" /> Precisam de atendimento agora ({waiting.length})
              </div>
              <div className="divide-y divide-border">{waiting.map((c) => <Row key={c.id} c={c} />)}</div>
            </Card>
          )}
          <Card className="rounded-2xl divide-y divide-border overflow-hidden">
            {others.map((c) => <Row key={c.id} c={c} />)}
            {others.length === 0 && waiting.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">Nenhuma conversa aqui.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
