import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ChatTimeline } from "@/components/guata/chat-timeline";
import { ConversationProfileCard } from "@/components/guata/conversation-profile-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, ImageIcon, Send } from "lucide-react";
import { DossieCard } from "@/components/guata/dossie-card";
import { HandoffControls } from "@/components/guata/handoff-controls";

export const Route = createFileRoute("/_app/conversas/$id")({
  component: ConversaDetail,
});

function fileToBase64(file: File): Promise<{ base64: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve({
        base64: result.slice(result.indexOf(",") + 1),
        type: file.type || "image/jpeg",
      });
    };
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

function ConversaDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);

  const { data: conv, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversation(id),
    refetchInterval: 5000,
  });

  useEffect(() => {
    api.markConversationSeen(id).catch(() => {});
  }, [id]);

  const replyMut = useMutation({
    mutationFn: async () => {
      let image: { base64: string; contentType: string } | undefined;
      if (imageFile) {
        const img = await fileToBase64(imageFile);
        image = { base64: img.base64, contentType: img.type };
      }
      if (!reply.trim() && !image) throw new Error("Informe texto ou imagem.");
      return api.replyConversation(id, reply.trim(), image);
    },
    onSuccess: () => {
      toast.success("Mensagem enviada");
      setReply("");
      setImageFile(null);
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["unread-counts"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao enviar"),
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

      <ConversationProfileCard conv={conv} />

      <DossieCard sessionId={conv.id} onUseMessage={setReply} />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base font-display">Conversa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <HandoffControls sessionId={conv.id} mode={conv.mode} />
          <div className="max-h-[min(60vh,520px)] overflow-y-auto rounded-xl bg-secondary/30 p-4">
            <ChatTimeline messages={conv.messages} />
          </div>
          <input
            ref={imageRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => imageRef.current?.click()}
              title="Enviar imagem"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            {imageFile && (
              <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                {imageFile.name}
              </span>
            )}
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="Mensagem (legenda se houver imagem)..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (reply.trim() || imageFile) replyMut.mutate();
                }
              }}
            />
            <Button
              onClick={() => replyMut.mutate()}
              disabled={replyMut.isPending || (!reply.trim() && !imageFile)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Atualiza automaticamente a cada poucos segundos. Enviar aqui usa o WhatsApp da empresa
            (Meta) — o cliente recebe no app normal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
