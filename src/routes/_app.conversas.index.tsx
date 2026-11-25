import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, BellRing, CheckSquare, Phone, Search, Trash2, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { LeadStageBadge, SessionModeBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, timeAgo } from "@/lib/format";
import type { Conversation } from "@/types/guata";
import { useOrgLineUi } from "@/hooks/use-org-line-ui";

type TabId = "ativas" | "leads" | "nao_contatar";

export const Route = createFileRoute("/_app/conversas/")({
  head: () => ({
    meta: [
      { title: "Conversas — Guatá Channel" },
      { name: "description", content: "Conversas do WhatsApp atendidas pelo Guatá e pela equipe." },
      { property: "og:title", content: "Conversas — Guatá Channel" },
      { property: "og:description", content: "Conversas do WhatsApp atendidas pelo Guatá e pela equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConversasPage,
});

function ConversasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("ativas");
  const [q, setQ] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const start = useMutation({
    mutationFn: () => api.startConversation(newPhone, newName || undefined),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate({ to: "/conversas/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível abrir a conversa"),
  });
  const { ui: orgUi } = useOrgLineUi();
  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    refetchInterval: 8000,
  });
  const markAllSeen = useMutation({
    mutationFn: () => api.markAllConversationsSeen(),
    onSuccess: (r) => {
      toast.success(
        r.updated ? `${r.updated} conversa(s) marcada(s) como vista(s)` : "Nada pendente para marcar",
      );
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["unread-counts"] });
    },
    onError: () => toast.error("Não foi possível marcar como vistas"),
  });
  const bulkOptOut = useMutation({
    mutationFn: (ids: string[]) => api.setManyDoNotContact(ids, "manual"),
    onSuccess: (r) => {
      toast.success(`${r.updated} contato(s) em Não contatar`);
      setSelected(new Set());
      setSelectMode(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao marcar"),
  });
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => api.deleteConversations(ids),
    onSuccess: (r) => {
      toast.success(`${r.updated} contato(s) excluído(s)`);
      setSelected(new Set());
      setSelectMode(false);
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message || "Falha ao excluir"),
  });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (c.archived && tab !== "nao_contatar") return false;
      if (term) {
        const hit =
          (c.contactName ?? "").toLowerCase().includes(term) ||
          c.phone.includes(term.replace(/\D/g, "") || "§");
        if (!hit) return false;
      }
      if (tab === "leads") {
        return c.leadStage === "qualificando" || c.leadStage === "quente";
      }
      if (tab === "nao_contatar") {
        return Boolean(c.doNotContact);
      }
      return !c.doNotContact;
    });
  }, [data, q, tab]);
  const waiting = list.filter((c) => c.needsAttention);
  const others = list.filter((c) => !c.needsAttention);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const Row = ({ c }: { c: Conversation }) => (
    <div className="flex items-center gap-3 p-4 hover:bg-secondary/40 transition">
      {selectMode && (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-primary"
          checked={selected.has(c.id)}
          onChange={() => toggleSelect(c.id)}
          aria-label={`Selecionar ${c.contactName ?? c.phone}`}
        />
      )}
      <Link to="/conversas/$id" params={{ id: c.id }} className="flex flex-1 items-center gap-3 min-w-0">
        <div className="relative h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">
          {(c.contactName ?? c.phone).slice(0, 2).toUpperCase()}
          {c.unseen && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{c.contactName ?? formatPhone(c.phone)}</span>
            <LineBadge line={c.line} org={orgUi} />
            <SessionModeBadge mode={c.mode} />
            {c.leadStage && <LeadStageBadge stage={c.leadStage} />}
            {c.doNotContact && (
              <span className="text-[10px] uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Não contatar
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground truncate">{c.lastMessage}</div>
        </div>
        <div className="text-xs text-muted-foreground">{timeAgo(c.lastMessageAt)}</div>
      </Link>
    </div>
  );

  const tabs: Array<[TabId, string]> = [
    ["ativas", "Ativas"],
    ["leads", "Leads"],
    ["nao_contatar", "Não contatar"],
  ];

  return (
    <div className="space-y-4 w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-primary">Conversas</h1>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <Button type="button" size="sm" variant="outline" onClick={exitSelectMode}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectMode(true)}
            >
              <CheckSquare className="h-4 w-4 mr-1" /> Selecionar
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen((v) => !v)}>
            <Phone className="h-4 w-4 mr-1" /> Nova conversa
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap rounded-full bg-muted p-1" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setSelected(new Set());
              }}
              className={
                "px-3 py-1 text-sm rounded-full transition " +
                (tab === id ? "bg-card text-primary font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {selectMode && (
        <Card className="rounded-2xl p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selected.size ? `${selected.size} selecionado(s)` : "Marque as conversas"}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelected(new Set(list.map((c) => c.id)))}
          >
            Selecionar visíveis
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulkOptOut.isPending || selected.size === 0}
            onClick={() => bulkOptOut.mutate([...selected])}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            Não contatar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={bulkDelete.isPending || selected.size === 0}
            onClick={() => {
              if (
                window.confirm(
                  `Excluir ${selected.size} contato(s)? Eles saem do painel e não entram em campanhas.`,
                )
              ) {
                bulkDelete.mutate([...selected]);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Excluir
          </Button>
        </Card>
      )}

      {tab === "nao_contatar" && (
        <p className="text-xs text-muted-foreground">
          Sem campanhas nem follow-up. Quem recusou convite entra aqui automaticamente. Se a pessoa
          escrever de novo, a equipe pode liberar o contato na conversa.
        </p>
      )}

      {newOpen && (
        <Card className="rounded-2xl p-4 space-y-3">
          <div className="text-sm font-medium">Chamar um número no WhatsApp</div>
          <div className="flex flex-wrap gap-2">
            <Input className="flex-1 min-w-[180px]" placeholder="Telefone com DDD (ex.: 67 99999-9999)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Input className="flex-1 min-w-[180px]" placeholder="Nome (opcional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button disabled={start.isPending || newPhone.replace(/\D/g, "").length < 10} onClick={() => start.mutate()}>
              Abrir conversa
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card className="rounded-2xl p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </Card>
      ) : (
        <>
          {waiting.length > 0 && tab === "ativas" && (
            <Card className="rounded-2xl overflow-hidden border-destructive/50">
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-destructive/10 text-destructive font-medium">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4" /> Precisam de atendimento agora ({waiting.length})
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                  disabled={markAllSeen.isPending}
                  onClick={() => markAllSeen.mutate()}
                >
                  Marcar todos como vistos
                </Button>
              </div>
              <div className="divide-y divide-border">{waiting.map((c) => <Row key={c.id} c={c} />)}</div>
            </Card>
          )}
          <Card className="rounded-2xl divide-y divide-border overflow-hidden">
            {(tab === "ativas" ? others : list).map((c) => (
              <Row key={c.id} c={c} />
            ))}
            {list.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma conversa aqui.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
