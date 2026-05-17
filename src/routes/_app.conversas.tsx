import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { SessionModeBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_app/conversas")({
  component: ConversasPage,
});

function ConversasPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">
          Conversas
        </h1>
        <p className="text-muted-foreground">
          Sessões WhatsApp em andamento — modo informacional, triagem, humano ou aguardando.
        </p>
      </div>

      <Card className="rounded-2xl divide-y divide-border overflow-hidden">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-12" />
              </div>
            ))
          : data?.map((c) => (
              <Link
                key={c.id}
                to="/conversas/$id"
                params={{ id: c.id }}
                className="block p-4 hover:bg-secondary/40 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">
                    {(c.contactName ?? c.phone).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {c.contactName ?? formatPhone(c.phone)}
                      </span>
                      <LineBadge line={c.line} />
                      <SessionModeBadge mode={c.mode} />
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {c.lastMessage}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {timeAgo(c.lastMessageAt)}
                  </div>
                </div>
              </Link>
            ))}
        {!isLoading && data?.length === 0 && (
          <div className="p-10 text-center text-muted-foreground">
            Nenhuma conversa ativa.
          </div>
        )}
      </Card>
    </div>
  );
}