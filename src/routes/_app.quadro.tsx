import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { api } from "@/lib/api/client";
import { updateConversationCrm } from "@/lib/crm.functions";
import { CRM_COLUMNS, columnLabel } from "@/lib/crm.shared";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/format";
import type { Conversation } from "@/types/guata";

export const Route = createFileRoute("/_app/quadro")({
  head: () => ({ meta: [{ title: "Quadro — Guatá Channel" }] }),
  component: QuadroPage,
});

function QuadroPage() {
  const qc = useQueryClient();
  const save = useServerFn(updateConversationCrm);
  const [prefix, setPrefix] = useState("Tráfego");
  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
  });
  const move = useMutation({
    mutationFn: (v: { id: string; column: Conversation["crmColumn"] }) =>
      save({ data: { id: v.id, column: v.column ?? null } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const columns = useMemo(() => {
    const rows = (data ?? []).filter((c) => !c.archived);
    return CRM_COLUMNS.map((col) => ({
      ...col,
      items: rows.filter((c) => {
        if (c.crmColumn) return c.crmColumn === col.id;
        if (col.id !== "interessados") return false;
        return c.leadStage === "qualificando" || c.leadStage === "quente";
      }),
    }));
  }, [data]);

  const exportCsv = () => {
    const lines = ["Name,Phone"];
    for (const c of data ?? []) {
      if (c.archived) continue;
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary">Quadro</h1>
          <p className="text-muted-foreground text-sm">
            Arraste não é preciso: escolha a próxima coluna. Isso organiza o Guatá Channel, não o
            aplicativo do celular.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            className="w-40"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Prefixo do nome"
          />
          <Button type="button" variant="outline" onClick={exportCsv}>
            Exportar Google Contatos
          </Button>
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
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
                    onChange={(e) =>
                      move.mutate({
                        id: c.id,
                        column: (e.target.value || null) as Conversation["crmColumn"],
                      })
                    }
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
      )}
    </div>
  );
}
