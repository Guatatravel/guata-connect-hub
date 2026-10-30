import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { provisionAccessRequest } from "@/lib/organizations.functions";
import { deleteAccessRequest } from "@/lib/access-requests.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

export const Route = createFileRoute("/_app/solicitacoes")({
  head: () => ({ meta: [{ title: "Solicitações de acesso — Guatá Channel" }] }),
  component: SolicitacoesPage,
});

const STATUS: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  aguardando_pagamento: "Aguardando pagamento",
  liberado: "Acesso liberado",
  recusado: "Recusado",
};

function SolicitacoesPage() {
  const qc = useQueryClient();
  const provision = useServerFn(provisionAccessRequest);
  const removeRequest = useServerFn(deleteAccessRequest);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["access-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const provisionMut = useMutation({
    mutationFn: (requestId: string) => provision({ data: { requestId } }),
    onSuccess: (res) => {
      if (res.alreadyProvisioned && !res.accessLiberated) {
        toast.info("Esta solicitação já foi liberada anteriormente.");
      } else if (res.accessLiberated) {
        toast.success("Agência liberada — o parceiro já pode usar WhatsApp e o painel completo.");
      } else if (res.tempPassword) {
        toast.success(
          `Conta criada. Envie ao parceiro: ${res.email} / senha: ${res.tempPassword}`,
          { duration: 20000 },
        );
      } else {
        toast.success(`Usuário existente vinculado à org (${res.slug}).`);
      }
      qc.invalidateQueries({ queryKey: ["access-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("access_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Situação atualizada");
      qc.invalidateQueries({ queryKey: ["access-requests"] });
    },
    onError: () => toast.error("Somente administradores podem alterar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => removeRequest({ data: { id } }),
    onSuccess: () => {
      toast.success("Solicitação removida");
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["access-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary">Solicitações de acesso</h1>
          <p className="text-muted-foreground">
            Pedidos de novas agências (cadastro com login na hora ou formulário antigo).{" "}
            <strong>Liberar acesso</strong> ativa WhatsApp e IA; em cadastros antigos sem conta, também
            cria login.
          </p>
        </div>
      </div>

      {isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {error && <p className="text-destructive">Apenas administradores podem ver esta lista.</p>}
      {data?.length === 0 && (
        <Card className="rounded-2xl"><CardContent className="p-10 text-center text-muted-foreground">Nenhuma solicitação ainda.</CardContent></Card>
      )}
      <div className="grid gap-4">
        {data?.map((r) => {
          const wa = `https://wa.me/${r.whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}`;
          let selfRegistered = false;
          if (r.notas) {
            try {
              selfRegistered = Boolean(JSON.parse(String(r.notas)).self_registered);
            } catch {
              /* ignore */
            }
          }
          return (
            <Card key={r.id} className="rounded-2xl">
              <CardContent className="p-5 grid md:grid-cols-[1fr_auto] gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-primary">
                    {r.empresa}{" "}
                    <span className="font-normal text-muted-foreground">· {r.nome}</span>
                    {selfRegistered && (
                      <span className="ml-2 text-xs font-normal text-accent">conta já criada</span>
                    )}
                  </p>
                  <p className="text-sm">{r.email} · {r.whatsapp}{r.cidade ? ` · ${r.cidade}` : ""}</p>
                  {r.mensagem && <p className="text-sm text-muted-foreground">{r.mensagem}</p>}
                  <p className="text-xs text-muted-foreground">Recebida em {formatDate(r.created_at)}</p>
                </div>
                <div className="flex flex-col gap-2 min-w-56">
                  <Select value={r.status} onValueChange={(status) => upd.mutate({ id: r.id, status })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" asChild>
                    <a href={wa} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
                  </Button>
                  <Button
                    size="sm"
                    disabled={provisionMut.isPending || r.status === "liberado"}
                    onClick={() => provisionMut.mutate(r.id)}
                  >
                    {r.status === "liberado" ? "Já liberado" : "Liberar acesso"}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/usuarios">Usuários (manual)</Link>
                  </Button>
                  <AlertDialog
                    open={deleteId === r.id}
                    onOpenChange={(open) => setDeleteId(open ? r.id : null)}
                  >
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        Excluir solicitação
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir solicitação?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Remove permanentemente o pedido de {r.empresa} ({r.email}). Essa ação não
                          pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(r.id)}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
