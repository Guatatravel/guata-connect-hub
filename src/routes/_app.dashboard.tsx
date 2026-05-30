import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { StatCard } from "@/components/guata/stat-card";
import { TriagemStatusBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Plane,
  UserCog,
  Users,
  MessageSquare,
  Megaphone,
} from "lucide-react";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.getDashboardStats(),
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral da operação Guatá hoje.
        </p>
      </div>

      {data && data.postsPendentes > 0 && (
        <Alert className="border-accent bg-accent/20">
          <Megaphone className="h-4 w-4" />
          <AlertTitle>Posts pendentes no Canal</AlertTitle>
          <AlertDescription>
            {data.postsPendentes} post(s) gerados a partir de eventos do
            Descubra MS aguardando publicação manual.{" "}
            <Link to="/canal" className="underline font-medium">
              Abrir Canal →
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Triagens hoje"
              value={data.triagensHoje}
              icon={Plane}
              accent
            />
            <StatCard
              label="Aguardando consultor"
              value={data.aguardandoConsultor}
              icon={UserCog}
            />
            <StatCard
              label="Em atendimento humano"
              value={data.emAtendimentoHumano}
              icon={Users}
            />
            <StatCard
              label="Conversas ativas"
              value={data.conversasAtivas}
              icon={MessageSquare}
            />
          </>
        )}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display">Últimas triagens</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.ultimasTriagens.map((t) => (
                <Link
                  key={t.id}
                  to="/triagens/$id"
                  params={{ id: t.id }}
                  className="grid grid-cols-12 items-center py-3 gap-3 hover:bg-secondary/40 -mx-3 px-3 rounded-lg transition"
                >
                  <div className="col-span-2 font-mono text-sm text-muted-foreground">
                    {t.protocol}
                  </div>
                  <div className="col-span-3 font-medium">{t.name}</div>
                  <div className="col-span-3 text-sm text-muted-foreground">
                    {t.destino}
                  </div>
                  <div className="col-span-2">
                    <LineBadge line={t.line} />
                  </div>
                  <div className="col-span-1">
                    <TriagemStatusBadge status={t.status as never} />
                  </div>
                  <div className="col-span-1 text-right text-xs text-muted-foreground">
                    {timeAgo(t.createdAt)}
                  </div>
                </Link>
              ))}
              {data.ultimasTriagens.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma triagem ainda.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}