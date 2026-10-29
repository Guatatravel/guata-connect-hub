import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Archive, ArchiveRestore, BellRing, Phone, Search } from "lucide-react";
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
import { CRM_COLUMNS, CRM_GUIDES, columnLabel } from "@/lib/crm.shared";
import { updateConversationCrm } from "@/lib/crm.functions";

export const Route = createFileRoute("/_app/conversas/")({
  head: () => ({ meta: [{ title: "Conversas — Guatá Channel" }] }),
  component: ConversasPage,
});

function ConversasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"ativas" | "arquivadas" | "leads" | "vendas">("ativas");
  const [q, setQ] = useState("");
  const [guide, setGuide] = useState("");
  const [prefix, setPrefix] = useState("Tráfego");
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
  const saveCrm = useServerFn(updateConversationCrm);
  const move = useMutation({
    mutationFn: (v: { id: string; column: Conversation["crmColumn"] }) =>
      saveCrm({ data: { id: v.id, column: v.column ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
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
      if (guide && c.crmGuide !== guide) return false;
      if (term) {
        return (c.contactName ?? "").toLowerCase().includes(term) || c.phone.includes(term.replace(/\D/g, "") || "§");
      }
      if (tab === "vendas") return !c.archived;
      if (tab === "leads") {
        return (
          !c.archived &&
          (c.leadStage === "qualificando" || c.leadStage === "quente")
        );
      }
      return tab === "arquivadas" ? c.archived : !c.archived;
    });
  }, [data, q, tab, guide]);
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
            <LineBadge line={c.line} org={orgUi} />
            <SessionModeBadge mode={c.mode} />
            {c.crmGuide && <span className="text-[10px] rounded-full bg-secondary px-1.5 py-0.5">{c.crmGuide}</span>}
            {c.leadStage && <LeadStageBadge stage={c.leadStage} />}
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
        <Button variant={tab === "leads" ? "default" : "outline"} size="sm" onClick={() => setTab("leads")}>Leads</Button>
        <Button variant={tab === "vendas" ? "default" : "outline"} size="sm" onClick={() => setTab("vendas")}>Vendas</Button>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
        >
          <option value="">Todas as guias</option>
          {CRM_GUIDES.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" onClick={() => setNewOpen((v) => !v)}>
          <Phone className="h-4 w-4 mr-1" /> Nova conversa
        </Button>
      </div>

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
          <p className="text-xs text-muted-foreground">
            Se o cliente não falou com o Guatá nas últimas 24h, a Meta pode não entregar mensagem livre.
          </p>
        </Card>
      )}
      <div className="hidden">
      </div>

      {isLoading ? (
        <Card className="rounded-2xl p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </Card>
      ) : tab === "vendas" ? (
        <SalesBoard
          rows={list}
          prefix={prefix}
          onPrefix={setPrefix}
          onMove={(id, column) => move.mutate({ id, column })}
        />
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

function SalesBoard({
  rows,
  prefix,
  onPrefix,
  onMove,
}: {
  rows: Conversation[];
  prefix: string;
  onPrefix: (v: string) => void;
  onMove: (id: string, column: Conversation["crmColumn"]) => void;
}) {
  const columns = CRM_COLUMNS.map((col) => ({
    ...col,
    items: rows.filter((c) => {
      if (c.crmColumn) return c.crmColumn === col.id;
      if (col.id !== "interessados") return false;
      return c.leadStage === "qualificando" || c.leadStage === "quente";
    }),
  }));
  const exportCsv = () => {
    const lines = ["Name,Phone"];
    for (const c of rows) {
      const name = `${prefix.trim() || "Contato"} — ${c.contactName || formatPhone(c.phone)}`;
      lines.push(`"${name.replaceAll('"', "'")}","+${c.phone.replace(/\D/g, "")}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos-guata.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="w-40" value={prefix} onChange={(e) => onPrefix(e.target.value)} placeholder="Prefixo do nome" />
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          Exportar Google Contatos
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((col) => (
          <Card key={col.id} className="rounded-2xl p-3 space-y-2 min-h-48">
            <div className="font-medium text-sm">
              {col.label} ({col.items.length})
            </div>
            {col.items.map((c) => (
              <div key={c.id} className="rounded-xl border p-3 space-y-2 bg-card">
                <Link to="/conversas/$id" params={{ id: c.id }} className="font-medium block">
                  {c.contactName || formatPhone(c.phone)}
                </Link>
                <div className="text-xs text-muted-foreground line-clamp-2">{c.lastMessage}</div>
                <div className="text-xs">{c.crmGuide || "Sem guia"}</div>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={c.crmColumn ?? ""}
                  onChange={(e) => onMove(c.id, (e.target.value || null) as Conversation["crmColumn"])}
                >
                  <option value="">{columnLabel()}</option>
                  {CRM_COLUMNS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
