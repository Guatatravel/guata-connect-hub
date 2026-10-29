import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deleteQuickReply, listQuickReplies, saveQuickReply } from "@/lib/crm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_app/respostas")({
  head: () => ({ meta: [{ title: "Respostas rápidas — Guatá Channel" }] }),
  component: RespostasPage,
});

function RespostasPage() {
  const qc = useQueryClient();
  const load = useServerFn(listQuickReplies);
  const save = useServerFn(saveQuickReply);
  const remove = useServerFn(deleteQuickReply);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => load(),
  });
  const create = useMutation({
    mutationFn: () => save({ data: { title, body } }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      toast.success("Resposta salva");
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const drop = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick-replies"] }),
  });

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">Respostas rápidas</h1>
        <p className="text-muted-foreground text-sm">
          Frases fixas da equipe. Na conversa, escolha o título e o texto entra no campo. O cliente
          só recebe quando você envia. O Copiloto continua escrevendo uma sugestão nova, à parte.
        </p>
      </div>
      <Card className="rounded-2xl p-4 space-y-2">
        <Input placeholder="Título, ex.: Orçamento" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          className="w-full min-h-24 rounded-md border bg-background p-2 text-sm"
          placeholder="Segue o orçamento. Posso reservar?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button disabled={create.isPending || !title.trim() || !body.trim()} onClick={() => create.mutate()}>
          Salvar
        </Button>
      </Card>
      {data?.needsSql && (
        <p className="text-sm text-destructive">
          Falta criar a tabela. No SQL editor do Supabase, rode o arquivo
          supabase/migrations/20261026230000_quick_replies.sql.
        </p>
      )}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {(data?.replies ?? []).map((r) => (
            <Card key={r.id} className="rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => drop.mutate(r.id)}>
                  Apagar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
