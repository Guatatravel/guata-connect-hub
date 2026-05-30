import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { TriagemStatusBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { ChatTimeline } from "@/components/guata/chat-timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { type TriagemStatus } from "@/types/guata";
import { formatDate, waLink, formatPhone } from "@/lib/format";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";

export const Route = createFileRoute("/_app/triagens/$id")({
  component: TriagemDetailPage,
});

function TriagemDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: triage, isLoading } = useQuery({
    queryKey: ["triage", id],
    queryFn: () => api.getTriage(id),
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
  });
  const { data: staff } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.listStaff(),
  });

  const conv = conversations?.find((c) => c.phone === triage?.phone);

  const [notes, setNotes] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (triage?.notes !== undefined) setNotes(triage.notes ?? "");
  }, [triage?.notes]);

  const updateMut = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateTriage>[1]) =>
      api.updateTriage(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["triage", id] });
      qc.invalidateQueries({ queryKey: ["triages"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: () => toast.error("Erro ao atualizar"),
  });

  const releaseMut = useMutation({
    mutationFn: () => api.releaseBot(id),
    onSuccess: () => {
      toast.success("Bot reativado para este contato");
      qc.invalidateQueries({ queryKey: ["triage", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const replyMut = useMutation({
    mutationFn: (text: string) =>
      conv ? api.replyConversation(conv.id, text) : Promise.reject("sem conversa"),
    onSuccess: () => {
      toast.success("Mensagem enviada");
      setReply("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: () => toast.error("Não foi possível enviar"),
  });

  if (isLoading || !triage) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  const setStatus = (s: TriagemStatus) => {
    updateMut.mutate(
      { status: s },
      { onSuccess: () => toast.success(`Status: ${s.replace("_", " ")}`) },
    );
  };

  const assignTo = (who: string) => {
    updateMut.mutate(
      { assignedTo: who, status: triage.status === "novo" ? "atribuido" : triage.status },
      { onSuccess: () => toast.success(`Atribuído a ${who}`) },
    );
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link to="/triagens">
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar para fila
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-semibold text-primary">
            {triage.protocol}
          </h1>
          <TriagemStatusBadge status={triage.status} />
          <LineBadge line={triage.line} />
          <a
            href={waLink(triage.phone)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <MessageCircle className="h-4 w-4" />
            {formatPhone(triage.phone)}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Form coletado */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display">Formulário coletado pelo bot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Nome" value={triage.name} />
            <Field label="Destino" value={triage.destino} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ida" value={formatDate(triage.dataIda)} />
              <Field label="Volta" value={formatDate(triage.dataVolta)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Viajantes" value={String(triage.viajantes)} />
              <Field label="Orçamento" value={triage.faixaOrcamento} />
            </div>
            {triage.origem && <Field label="Origem" value={triage.origem} />}
            {triage.preferencias && (
              <Field label="Preferências" value={triage.preferencias} />
            )}

            <div className="pt-4 border-t border-border space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Notas internas
              </Label>
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações do consultor..."
              />
              <Button
                size="sm"
                onClick={() =>
                  updateMut.mutate(
                    { notes },
                    { onSuccess: () => toast.success("Notas salvas") },
                  )
                }
              >
                Salvar notas
              </Button>
            </div>

            <div className="pt-4 border-t border-border space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Atribuir consultor
              </Label>
              <Select
                value={triage.assignedTo ?? ""}
                onValueChange={assignTo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar consultor" />
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
          </CardContent>
        </Card>

        {/* Timeline + ações */}
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="font-display">Conversa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  updateMut.mutate(
                    {
                      assignedTo: triage.assignedTo ?? staff?.[0]?.id,
                      status: "atribuido",
                    },
                    { onSuccess: () => toast.success("Atendimento assumido — bot pausado") },
                  );
                  if (conv) replyMut.mutate("Olá! Aqui é da Guatá Viagens. Como posso ajudar?");
                }}
              >
                Assumir atendimento
              </Button>
              <Button size="sm" variant="outline" onClick={() => releaseMut.mutate()}>
                Encerrar e liberar bot
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("contactado")}>
                Marcar contactado
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("proposta_enviada")}>
                Proposta enviada
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("fechado")}>
                Fechado
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatus("perdido")}>
                Perdido
              </Button>
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded-xl bg-secondary/30 p-4">
              {conv ? (
                <ChatTimeline messages={conv.messages} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma conversa associada a este telefone.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enviar mensagem como consultor..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                disabled={!conv}
              />
              <Button
                onClick={() => reply.trim() && replyMut.mutate(reply.trim())}
                disabled={!conv || !reply.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}