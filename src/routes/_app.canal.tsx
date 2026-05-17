import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Copy, Check, X, ExternalLink, Megaphone } from "lucide-react";
import { formatDate } from "@/lib/format";
import { isDescubraConfigured } from "@/integrations/descubra/client";

export const Route = createFileRoute("/_app/canal")({
  component: CanalPage,
});

function CanalPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["channel-posts"],
    queryFn: () => api.listChannelPosts(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "publicado" | "ignorado" | "rascunho" }) =>
      api.updateChannelPost(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-posts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary">
            Canal — Posts de eventos
          </h1>
          <p className="text-muted-foreground">
            Posts gerados automaticamente quando o Descubra MS publica um evento.
          </p>
        </div>
        {!isDescubraConfigured() && (
          <Badge variant="outline" className="border-accent text-accent-foreground">
            Modo mock — integração Descubra pendente
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : data?.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-12 text-center space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone className="h-6 w-6" />
            </div>
            <h3 className="font-display text-xl">Nada por aqui ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Quando o time do Descubra MS publicar um evento, um post de Canal
              será gerado automaticamente via webhook e aparecerá aqui pronto
              para revisar e publicar no WhatsApp Channel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data?.map((p) => (
            <Card key={p.id} className="rounded-2xl overflow-hidden">
              <div className="aspect-[16/9] bg-secondary overflow-hidden">
                <img
                  src={p.thumbnail}
                  alt={p.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-display font-semibold text-lg leading-tight">
                      {p.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {p.city} · {formatDate(p.eventDate)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.status === "publicado"
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : p.status === "ignorado"
                          ? "bg-stone-200 text-stone-700"
                          : "bg-accent/30 text-accent-foreground border-accent"
                    }
                  >
                    {p.status}
                  </Badge>
                </div>

                <pre className="text-xs bg-secondary/50 rounded-lg p-3 whitespace-pre-wrap font-sans leading-relaxed border border-border">
                  {p.body}
                </pre>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => copy(p.body)}>
                    <Copy className="h-4 w-4 mr-1" /> Copiar texto
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={p.link} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" /> Ver no site
                    </a>
                  </Button>
                  {p.status !== "publicado" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMut.mutate(
                          { id: p.id, status: "publicado" },
                          { onSuccess: () => toast.success("Marcado como publicado") },
                        )
                      }
                    >
                      <Check className="h-4 w-4 mr-1" /> Marcar publicado
                    </Button>
                  )}
                  {p.status === "rascunho" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        updateMut.mutate({ id: p.id, status: "ignorado" })
                      }
                    >
                      <X className="h-4 w-4 mr-1" /> Ignorar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}