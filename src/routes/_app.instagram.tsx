import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchInstagramSettings, saveInstagramSettings } from "@/lib/instagram.functions";

export const Route = createFileRoute("/_app/instagram")({
  head: () => ({
    meta: [
      { title: "Instagram → WhatsApp — Guatá Channel" },
      { name: "description", content: "Responda comentários do Instagram e leve os interessados para o WhatsApp." },
      { property: "og:title", content: "Instagram → WhatsApp — Guatá Channel" },
      { property: "og:description", content: "Ponte automática de comentários do Instagram para o WhatsApp oficial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InstagramPage,
});

type Form = {
  enabled: boolean;
  igAccountId: string;
  accessToken: string;
  whatsappNumber: string;
  keywords: string;
  replyAnyQuestion: boolean;
  commentReplies: string;
  dmExtra: string;
};

const STATUS: Record<string, string> = { respondido: "Respondido", ignorado: "Ignorado", erro: "Erro", recebido: "Recebido" };

function InstagramPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchInstagramSettings);
  const saveFn = useServerFn(saveInstagramSettings);
  const { data, isLoading } = useQuery({ queryKey: ["instagram"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (data && !form)
      setForm({
        enabled: data.enabled,
        igAccountId: data.igAccountId,
        accessToken: "",
        whatsappNumber: data.whatsappNumber,
        keywords: data.keywords.join(", "),
        replyAnyQuestion: data.replyAnyQuestion,
        commentReplies: data.commentReplies.join("\n"),
        dmExtra: data.dmExtra,
      });
  }, [data, form]);

  const save = useMutation({
    mutationFn: (f: Form) =>
      saveFn({
        data: {
          enabled: f.enabled,
          igAccountId: f.igAccountId,
          accessToken: f.accessToken || null,
          whatsappNumber: f.whatsappNumber,
          keywords: f.keywords.split(",").map((k) => k.trim()).filter(Boolean),
          replyAnyQuestion: f.replyAnyQuestion,
          commentReplies: f.commentReplies.split("\n").map((k) => k.trim()).filter(Boolean),
          dmExtra: f.dmExtra,
        },
      }),
    onSuccess: () => {
      toast.success("Instagram salvo");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["instagram"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar"),
  });

  if (isLoading || !data || !form) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64 mx-auto" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const disabled = !data.canEdit || save.isPending;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-semibold">Instagram → WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Quem comentar uma palavra-chave recebe resposta no post e um Direct com o link do seu WhatsApp. A venda continua no WhatsApp.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Ponte ligada</CardTitle>
            <CardDescription>Desligue a qualquer momento — o Instagram continua normal no celular.</CardDescription>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} disabled={disabled} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conexão</CardTitle>
          <CardDescription>Uma conta do Instagram Business por agência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>ID da conta do Instagram Business</Label>
            <Input value={form.igAccountId} onChange={(e) => set("igAccountId", e.target.value)} disabled={disabled} placeholder="1784..." />
          </div>
          <div className="space-y-1.5">
            <Label>Token de acesso</Label>
            <Input
              type="password"
              value={form.accessToken}
              onChange={(e) => set("accessToken", e.target.value)}
              disabled={disabled}
              placeholder={data.hasToken ? "Token salvo •••• (deixe vazio para manter)" : "Cole o token aqui"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>WhatsApp de destino (com DDI)</Label>
            <Input value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} disabled={disabled} placeholder="5567999999999" />
          </div>
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Passo a passo na Meta</p>
            <p>1. Conta do Instagram como Profissional e ligada a uma Página do Facebook.</p>
            <p>2. No app da Meta, adicione o produto Instagram e as permissões instagram_manage_comments e instagram_manage_messages.</p>
            <p>3. Em Webhooks → Instagram, use a URL <code>/api/public/webhooks/instagram</code> deste site com o mesmo token de verificação do WhatsApp e assine “comments”.</p>
            <p>4. Cole aqui o ID da conta e o token.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regra geral</CardTitle>
          <CardDescription>Vale para todos os posts e Reels. Configure uma vez.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Palavras-chave (separadas por vírgula)</Label>
            <Input value={form.keywords} onChange={(e) => set("keywords", e.target.value)} disabled={disabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label>Também responder comentários com pergunta (“?”)</Label>
            <Switch checked={form.replyAnyQuestion} onCheckedChange={(v) => set("replyAnyQuestion", v)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>Respostas públicas (uma por linha, varia para evitar spam — use {"{nome}"})</Label>
            <Textarea rows={4} value={form.commentReplies} onChange={(e) => set("commentReplies", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>Instrução extra para o Direct (opcional)</Label>
            <Textarea rows={2} value={form.dmExtra} onChange={(e) => set("dmExtra", e.target.value)} disabled={disabled} placeholder="Ex.: mencione a promoção de Bonito deste mês" />
          </div>
          <p className="text-xs text-muted-foreground">
            O Guatá escreve o Direct no idioma da pessoa, sem inventar preços, e sempre termina com o link do WhatsApp.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button onClick={() => save.mutate(form)} disabled={disabled}>
          {save.isPending ? "Salvando..." : "Salvar Instagram"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos comentários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.events.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário recebido ainda.</p>}
          {data.events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 text-sm border-b border-border pb-2">
              <div className="min-w-0">
                <span className="font-medium">@{e.username}</span>{" "}
                <span className="text-muted-foreground">{e.text}</span>
                {e.error && <p className="text-xs text-destructive">{e.error}</p>}
              </div>
              <Badge variant={e.status === "erro" ? "destructive" : "secondary"}>{STATUS[e.status] ?? e.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
