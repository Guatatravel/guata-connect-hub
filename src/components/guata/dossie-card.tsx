import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDossie, regenerateDossie } from "@/lib/dossie.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Copy, RefreshCw, Sparkles, Send } from "lucide-react";
import { formatDateTime } from "@/lib/format";

const TEMP: Record<string, { label: string; cls: string }> = {
  quente: { label: "🔥 Quente", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  morno: { label: "Morno", cls: "bg-accent/40 text-accent-foreground border-accent" },
  frio: { label: "Frio", cls: "bg-secondary text-secondary-foreground border-border" },
};

export function DossieCard({
  sessionId,
  onUseMessage,
}: {
  sessionId: string;
  onUseMessage?: (text: string) => void;
}) {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getDossie);
  const regenFn = useServerFn(regenerateDossie);
  const key = ["dossie", sessionId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchFn({ data: { id: sessionId } }),
  });

  const regen = useMutation({
    mutationFn: () => regenFn({ data: { id: sessionId } }),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      toast.success("Dossiê atualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível gerar o dossiê"),
  });

  const d = data?.dossie;

  return (
    <Card className="rounded-2xl border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="font-display flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> Dossiê de Fechamento
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => regen.mutate()} disabled={regen.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${regen.isPending ? "animate-spin" : ""}`} />
          {d ? "Atualizar" : "Gerar resumo"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading || regen.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !d ? (
          <p className="text-muted-foreground">
            A IA ainda não resumiu esta conversa. O dossiê é criado automaticamente quando o cliente
            pede um humano ou termina a triagem — ou clique em "Gerar resumo".
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={TEMP[d.temperatura]?.cls}>
                {TEMP[d.temperatura]?.label ?? d.temperatura}
              </Badge>
              {data?.at && (
                <span className="text-xs text-muted-foreground">
                  Gerado em {formatDateTime(data.at)}
                </span>
              )}
            </div>
            {d.interesse && <p className="font-medium">{d.interesse}</p>}
            {d.resumo && <p className="text-muted-foreground leading-relaxed">{d.resumo}</p>}

            {Object.keys(d.dados).length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(d.dados).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-secondary/40 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</div>
                    <div className="font-medium">{v}</div>
                  </div>
                ))}
              </div>
            )}

            {d.objecoes.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Dúvidas e objeções
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {d.objecoes.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            )}

            {d.proximo_passo && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <span className="font-medium">Próximo passo: </span>
                {d.proximo_passo}
              </div>
            )}

            {d.mensagem_sugerida && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Mensagem sugerida
                </div>
                <div className="rounded-lg bg-card border border-border px-3 py-2 whitespace-pre-wrap">
                  {d.mensagem_sugerida}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(d.mensagem_sugerida);
                      toast.success("Mensagem copiada");
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Copiar
                  </Button>
                  {onUseMessage && (
                    <Button size="sm" onClick={() => onUseMessage(d.mensagem_sugerida)}>
                      <Send className="h-4 w-4 mr-1" /> Usar na resposta
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
