import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";

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

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary">Solicitações de acesso</h1>
          <p className="text-muted-foreground">
            Pessoas que pediram acesso pela página de apresentação. Após o pagamento, crie o acesso em Usuários.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/apresentacao" target="_blank" rel="noreferrer">Ver página de apresentação</a>
        </Button>
      </div>

      {isLoading && <Skeleton className="h-40 rounded-2xl" />}
      {error && <p className="text-destructive">Apenas administradores podem ver esta lista.</p>}
      {data?.length === 0 && (
        <Card className="rounded-2xl"><CardContent className="p-10 text-center text-muted-foreground">Nenhuma solicitação ainda.</CardContent></Card>
      )}
      <div className="grid gap-4">
        {data?.map((r) => {
          const wa = `https://wa.me/${r.whatsapp.replace(/\D/g, "").replace(/^(?!55)/, "55")}`;
          return (
            <Card key={r.id} className="rounded-2xl">
              <CardContent className="p-5 grid md:grid-cols-[1fr_auto] gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-primary">{r.empresa} <span className="font-normal text-muted-foreground">· {r.nome}</span></p>
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
                  <Button size="sm" asChild>
                    <Link to="/usuarios">Liberar acesso</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
