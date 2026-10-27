import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ChatTimeline } from "@/components/guata/chat-timeline";
import { ConversationProfileCard } from "@/components/guata/conversation-profile-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, FileAudio, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { DossieCard } from "@/components/guata/dossie-card";
import { HandoffControls } from "@/components/guata/handoff-controls";
import { CopilotCard } from "@/components/guata/copilot-card";
import type { ChatMessage } from "@/types/guata";

function pendingLabel(text: string, file: File | null): string {
  if (file && (file.type.startsWith("audio/") || /\.(webm|mp3|m4a|ogg|aac|amr)$/i.test(file.name))) {
    return "[áudio]";
  }
  const caption = text.trim();
  if (caption) return caption;
  if (!file) return "";
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return isPdf ? "[documento]" : "[imagem]";
}

function forwardCaption(message: ChatMessage): string {
  const text = message.text?.trim() ?? "";
  if (!text || text === "[áudio]" || text === "[imagem]" || text === "[documento]") return "";
  if (text.startsWith("[cartaz]")) return text.replace(/^\[cartaz\]\s*/, "");
  if (text.startsWith("(falha")) return "";
  return text;
}

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
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [recording, setRecording] = useState(false);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [forwardQuery, setForwardQuery] = useState("");
  const [forwardPhone, setForwardPhone] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [outgoing, setOutgoing] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!attachFile || !attachFile.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachFile]);

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.listConversations(),
    enabled: Boolean(forwarding),
  });

  const { data: conv, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.getConversation(id),
    refetchInterval: 5000,
  });

  useEffect(() => {
    api.markConversationSeen(id).catch(() => {});
  }, [id]);

  const replyMut = useMutation({
    mutationFn: async (payload: { text: string; file: File | null; replyToMessage: ChatMessage | null }) => {
      let attachment:
        | { base64: string; contentType: string; filename?: string; kind: "image" | "document" | "audio" }
        | undefined;
      if (payload.file) {
        let source = payload.file;
        const isAudio = source.type.startsWith("audio/") || /\.(webm|mp3|m4a|ogg|aac|amr)$/i.test(source.name);
        if (isAudio) {
          const { needsWhatsAppAudioTranscode, transcodeToMp3 } = await import("@/lib/whatsapp-audio");
          if (needsWhatsAppAudioTranscode(source)) source = await transcodeToMp3(source);
        }
        const file = await fileToBase64(source);
        const isPdf =
          source.type === "application/pdf" || source.name.toLowerCase().endsWith(".pdf");
        attachment = {
          base64: file.base64,
          contentType: isAudio ? source.type || "audio/mpeg" : file.type,
          filename: source.name,
          kind: isAudio ? "audio" : isPdf ? "document" : "image",
        };
      }
      if (!payload.text.trim() && !attachment) throw new Error("Informe texto ou anexo.");
      return api.replyConversation(id, payload.text.trim(), attachment, payload.replyToMessage?.id);
    },
    onMutate: (payload) => {
      const pending: ChatMessage = {
        id: `local-${crypto.randomUUID()}`,
        role: "human",
        text: pendingLabel(payload.text, payload.file),
        at: new Date().toISOString(),
      };
      setOutgoing((prev) => [...prev, pending]);
      setReply("");
      setAttachFile(null);
      setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
      if (audioRef.current) audioRef.current.value = "";
      return pending.id;
    },
    onSuccess: async (_data, _payload, pendingId) => {
      toast.success("Mensagem enviada");
      await qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["unread-counts"] });
      setOutgoing((prev) => prev.filter((m) => m.id !== pendingId));
    },
    onError: (e, payload, pendingId) => {
      setOutgoing((prev) => prev.filter((m) => m.id !== pendingId));
      setReply(payload.text);
      if (payload.file) setAttachFile(payload.file);
      if (payload.replyToMessage) setReplyTo(payload.replyToMessage);
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    },
  });

  const forwardMut = useMutation({
    mutationFn: async (targetId: string) => {
      const source = forwarding;
      if (!source) throw new Error("Nenhuma mensagem selecionada.");
      const caption = forwardCaption(source);
      let attachment:
        | { base64: string; contentType: string; filename?: string; kind: "image" | "document" | "audio" }
        | undefined;
      if (source.mediaUrl && source.mediaKind && source.mediaKind !== "video") {
        const downloaded = await fetch(source.mediaUrl);
        if (!downloaded.ok) throw new Error("Não consegui baixar o arquivo desta mensagem.");
        const blob = await downloaded.blob();
        const mime = (source.mediaMime || blob.type || "application/octet-stream").split(";")[0];
        const ext =
          source.mediaKind === "audio"
            ? "webm"
            : source.mediaKind === "document"
              ? "pdf"
              : "jpg";
        let file = new File([blob], source.mediaFilename || `encaminhada.${ext}`, { type: mime });
        if (source.mediaKind === "audio") {
          const { needsWhatsAppAudioTranscode, transcodeToMp3 } = await import("@/lib/whatsapp-audio");
          if (needsWhatsAppAudioTranscode(file)) file = await transcodeToMp3(file);
        }
        const encoded = await fileToBase64(file);
        const kind =
          source.mediaKind === "audio" ? "audio" : source.mediaKind === "document" ? "document" : "image";
        attachment = {
          base64: encoded.base64,
          contentType: file.type || mime,
          filename: file.name,
          kind,
        };
      }
      if (!caption && !attachment) {
        throw new Error("Essa mensagem não tem texto nem arquivo salvo para encaminhar.");
      }
      return api.replyConversation(targetId, caption, attachment);
    },
    onSuccess: () => {
      toast.success("Mensagem encaminhada");
      setForwarding(null);
      setForwardPhone("");
      setForwardQuery("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao encaminhar"),
  });

  const forwardTargets = (conversations ?? [])
    .filter((c) => c.id !== id && !c.archived)
    .filter((c) => {
      const q = forwardQuery.trim().toLowerCase();
      if (!q) return true;
      return `${c.contactName ?? ""} ${c.phone}`.toLowerCase().includes(q);
    })
    .slice(0, 40);

  if (isLoading || !conv) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }

  return (
    <div className="space-y-4 w-full max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/conversas">
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Link>
      </Button>

      <ConversationProfileCard conv={conv} />

      <DossieCard sessionId={conv.id} onUseMessage={setReply} />

      <CopilotCard sessionId={conv.id} onUseMessage={setReply} />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base font-display">Conversa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <HandoffControls sessionId={conv.id} mode={conv.mode} />
          <div className="max-h-[min(60vh,520px)] overflow-y-auto rounded-xl bg-secondary/30 p-4">
            <ChatTimeline
              messages={[
                ...conv.messages,
                ...outgoing.filter((pending) => {
                  const start = new Date(pending.at).getTime() - 5000;
                  return !conv.messages.some((m) => {
                    if (m.role !== "human" || m.id.startsWith("local-")) return false;
                    if (new Date(m.at).getTime() < start) return false;
                    return m.text === pending.text || m.text.includes(pending.text);
                  });
                }),
              ]}
              onForward={(message) => {
                setForwardQuery("");
                setForwardPhone("");
                setForwarding(message);
              }}
              onReply={(message) => {
                if (!message.waMessageId) {
                  toast.error(
                    "Essa mensagem é anterior ao ajuste e não tem o id do WhatsApp para citar.",
                  );
                  return;
                }
                setReplyTo(message);
              }}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={audioRef}
            type="file"
            accept="audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/webm,.mp3,.m4a,.ogg"
            className="hidden"
            onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
          />
          {replyTo && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
              <div className="min-w-0 flex-1 border-l-2 border-primary pl-2">
                <div className="font-medium">
                  Respondendo{" "}
                  {replyTo.role === "user" ? "o cliente" : replyTo.role === "bot" ? "o Guatá" : "o consultor"}
                </div>
                <div className="truncate opacity-70">{replyTo.text || "Mídia"}</div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {attachFile && (
            <div className="flex items-start gap-3 rounded-lg border border-border p-2">
              {previewUrl ? (
                <img src={previewUrl} alt="Prévia" className="h-20 w-20 rounded-md object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{attachFile.name}</span>
              )}
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                {previewUrl
                  ? "Escreva a legenda abaixo e envie. A imagem e o texto vão juntos, como no WhatsApp."
                  : attachFile.name}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  setAttachFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div
            className="flex flex-wrap gap-2 items-center"
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (const item of items) {
                if (!item.type.startsWith("image/")) continue;
                const file = item.getAsFile();
                if (!file) continue;
                e.preventDefault();
                const named = new File(
                  [file],
                  file.name || `colagem-${Date.now()}.png`,
                  { type: file.type || "image/png" },
                );
                setAttachFile(named);
                break;
              }
            }}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileRef.current?.click()}
              title="Imagem ou PDF"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={recording ? "destructive" : "outline"}
              size="icon"
              title={recording ? "Parar gravação" : "Gravar áudio"}
              onClick={async () => {
                if (recording && recorderRef.current) {
                  recorderRef.current.stop();
                  return;
                }
                if (!navigator.mediaDevices?.getUserMedia) {
                  toast.error("Este navegador não grava áudio. Anexe um MP3 ou OGG.");
                  return;
                }
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  const preferred = [
                    "audio/ogg;codecs=opus",
                    "audio/mp4",
                    "audio/webm;codecs=opus",
                    "audio/webm",
                  ].find((t) => MediaRecorder.isTypeSupported(t));
                  const rec = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
                  const chunks: Blob[] = [];
                  rec.ondataavailable = (ev) => {
                    if (ev.data.size > 0) chunks.push(ev.data);
                  };
                  rec.onstop = () => {
                    stream.getTracks().forEach((t) => t.stop());
                    setRecording(false);
                    recorderRef.current = null;
                    const type = (rec.mimeType || "audio/webm").split(";")[0];
                    const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
                    setAttachFile(new File(chunks, `audio-${Date.now()}.${ext}`, { type }));
                  };
                  recorderRef.current = rec;
                  rec.start();
                  setRecording(true);
                } catch {
                  toast.error("Não foi possível usar o microfone.");
                }
              }}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => audioRef.current?.click()}
              title="Anexar áudio"
            >
              <FileAudio className="h-4 w-4" />
            </Button>
            <Input
              className="flex-1 min-w-[200px]"
              placeholder={
                attachFile?.type.startsWith("audio/")
                  ? "Texto opcional, enviado depois do áudio..."
                  : attachFile?.type.startsWith("image/")
                    ? "Legenda da imagem..."
                    : "Mensagem (legenda se houver anexo). Cole uma imagem com Ctrl+V."
              }
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (reply.trim() || attachFile) {
                    replyMut.mutate({ text: reply, file: attachFile, replyToMessage: replyTo });
                  }
                }
              }}
            />
            <Button
              onClick={() => replyMut.mutate({ text: reply, file: attachFile, replyToMessage: replyTo })}
              disabled={replyMut.isPending || (!reply.trim() && !attachFile)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A conversa atualiza assim que chega mensagem. Enviar aqui usa o WhatsApp da empresa
            (Meta) — o cliente recebe no app normal.
          </p>
        </CardContent>
      </Card>

      <Dialog open={Boolean(forwarding)} onOpenChange={(open) => !open && setForwarding(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Encaminhar mensagem</DialogTitle>
            <DialogDescription>
              A outra pessoa recebe uma mensagem nova. Se ela não falou nas últimas 24 horas, o
              WhatsApp pode não entregar.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Buscar conversa por nome ou telefone"
            value={forwardQuery}
            onChange={(e) => setForwardQuery(e.target.value)}
          />
          <div className="max-h-52 overflow-y-auto rounded-lg border">
            {forwardTargets.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
            )}
            {forwardTargets.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-secondary/60"
                disabled={forwardMut.isPending}
                onClick={() => forwardMut.mutate(c.id)}
              >
                <span className="font-medium">{c.contactName || c.phone}</span>
                {c.contactName && (
                  <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ou um telefone com DDD"
              value={forwardPhone}
              onChange={(e) => setForwardPhone(e.target.value)}
            />
            <Button
              type="button"
              disabled={forwardMut.isPending || forwardPhone.replace(/\D/g, "").length < 10}
              onClick={async () => {
                try {
                  const started = await api.startConversation(forwardPhone);
                  forwardMut.mutate(started.id);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Telefone inválido");
                }
              }}
            >
              Enviar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
