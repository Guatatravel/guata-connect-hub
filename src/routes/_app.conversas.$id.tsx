import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ChatTimeline } from "@/components/guata/chat-timeline";
import { SessionModeBadge } from "@/components/guata/status-badge";
import { LineBadge } from "@/components/guata/line-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Send } from "lucide-react";
import { formatPhone, waLink } from "@/lib/format";

export const Route = createFileRoute("/_app/conversas/$id")({
  component: ConversaDetail,
});

function ConversaDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");

  const { data: conv, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversation(id),
  });

  const replyMut = useMutation({
    mutationFn: (text: string) => api.replyConversation(id, text),
    onSuccess: () => {
      toast.success("Mensagem enviada");
      setReply("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  if (isLoading || !conv) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/conversas">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Link>
      </Button>

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="font-display">
                {conv.contactName ?? formatPhone(conv.phone)}
              </CardTitle>
              <LineBadge line={conv.line} />
              <SessionModeBadge mode={conv.mode} />
            </div>
            <a
              href={waLink(conv.phone)}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
            >
              <MessageCircle className="h-4 w-4" />
              {formatPhone(conv.phone)}
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[500px] overflow-y-auto rounded-xl bg-secondary/30 p-4">
            <ChatTimeline messages={conv.messages} />
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Responder como consultor (pausa o bot)..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button
              onClick={() => reply.trim() && replyMut.mutate(reply.trim())}
              disabled={!reply.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}