import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TriagemStatusBadge } from "@/components/guata/status-badge";
import { api } from "@/lib/api/client";
import { fetchOpenTriageForSession } from "@/lib/panel.functions";
import type { TriagemStatus } from "@/types/guata";
import { formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { markTriagesSeen } from "@/lib/notifications.functions";

export function ConversationTriageCard({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const loadOpen = useServerFn(fetchOpenTriageForSession);
  const markSeen = useServerFn(markTriagesSeen);

  const { data: triage, isLoading } = useQuery({
    queryKey: ["open-triage", sessionId],
    queryFn: () => loadOpen({ data: { sessionId } }),
  });

  const { data: staff } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.listStaff(),
  });

  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (triage?.notes !== undefined) setNotes(triage.notes ?? "");
  }, [triage?.notes]);

  useEffect(() => {
    if (!triage?.id) return;
    void markSeen({ data: { id: triage.id } })
      .then(() => qc.invalidateQueries({ queryKey: ["unread-counts"] }))
      .catch(() => {});
  }, [triage?.id, markSeen, qc]);

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateTriage>[1]) =>
      triage ? api.updateTriage(triage.id, patch) : Promise.reject("sem triagem"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open-triage", sessionId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Skeleton className="h-24 rounded-2xl" />;
  }
  if (!triage) return null;

  const setStatus = (s: TriagemStatus) => {
    updateMut.mutate(
      { status: s },
      { onSuccess: () => toast.success(`Status: ${s.replace(/_/g, " ")}`) },
    );
  };

  return (
    <Card className="rounded-2xl border-accent/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display flex flex-wrap items-center gap-2">
          Triagem {triage.protocol}
          <TriagemStatusBadge status={triage.status} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
          <span>
            Destino: <strong className="text-foreground">{triage.destino}</strong>
          </span>
          {triage.origem && (
            <span>
              Origem: <strong className="text-foreground">{triage.origem}</strong>
            </span>
          )}
          {triage.dataIda && (
            <span>Ida: {formatDate(triage.dataIda)}</span>
          )}
          {triage.dataVolta && (
            <span>Volta: {formatDate(triage.dataVolta)}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            ["novo", "atribuido", "contactado", "proposta_enviada", "fechado", "perdido"] as TriagemStatus[]
          ).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={triage.status === s ? "default" : "outline"}
              onClick={() => setStatus(s)}
              disabled={updateMut.isPending}
            >
              {s.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Consultor</Label>
          <Select
            value={triage.assignedTo ?? ""}
            onValueChange={(who) =>
              updateMut.mutate(
                { assignedTo: who, status: triage.status === "novo" ? "atribuido" : triage.status },
                { onSuccess: () => toast.success("Atribuído") },
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Atribuir" />
            </SelectTrigger>
            <SelectContent>
              {(staff ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notas internas</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button
            size="sm"
            onClick={() =>
              updateMut.mutate({ notes }, { onSuccess: () => toast.success("Notas salvas") })
            }
          >
            Salvar notas
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}