import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ImageIcon, Megaphone, Send } from "lucide-react";
import {
  createCampaignFn,
  launchCampaignFn,
  listCampaignsFn,
  previewCampaignAudienceFn,
} from "@/lib/campaigns.functions";
import type { CampaignAudience, CampaignLine } from "@/lib/campaigns.types";

const AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  active_24h: "Falaram nas últimas 24h",
  active_7d: "Falaram nos últimos 7 dias",
  active_30d: "Falaram nos últimos 30 dias",
  all_sessions: "Todas as conversas da linha",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando…",
  concluida: "Concluída",
};

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

export function CampaignsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignsFn);
  const previewFn = useServerFn(previewCampaignAudienceFn);
  const createFn = useServerFn(createCampaignFn);
  const launchFn = useServerFn(launchCampaignFn);
  const imageRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [line, setLine] = useState<CampaignLine>("descubra");
  const [audience, setAudience] = useState<CampaignAudience>("active_7d");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listFn(),
  });

  const { data: preview } = useQuery({
    queryKey: ["campaign-audience", line, audience],
    queryFn: () => previewFn({ data: { line, audience } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaigns"] });

  const createMut = useMutation({
    mutationFn: async () => {
      let imageBase64: string | undefined;
      let imageContentType: string | undefined;
      if (imageFile) {
        const img = await fileToBase64(imageFile);
        imageBase64 = img.base64;
        imageContentType = img.type;
      }
      const row = await createFn({
        data: {
          title: title.trim() || "Campanha",
          line,
          body,
          audience,
          imageBase64,
          imageContentType,
        },
      });
      return launchFn({ data: { id: row.id } });
    },
    onSuccess: (row) => {
      toast.success(
        `Envio: ${row.sent_ok} ok, ${row.sent_fail} falha, ${row.sent_skip} fora da janela 24h`,
      );
      setTitle("");
      setBody("");
      setImageFile(null);
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar"),
  });

  const continueMut = useMutation({
    mutationFn: (id: string) => launchFn({ data: { id } }),
    onSuccess: (row) => {
      toast.success(
        `Lote: ${row.sent_ok} ok, ${row.sent_fail} falha, ${row.sent_skip} ignorados`,
      );
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao continuar envio"),
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-dashed">
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p>
            Envio proativo no WhatsApp para quem já conversou com o número. A Meta só
            entrega mensagem livre (texto/cartaz) se o cliente falou nas{" "}
            <strong>últimas 24 horas</strong>; os demais entram como ignorados (templates
            virão depois).
          </p>
          <p>
            Use a aba <strong>Base</strong> para ensinar o Guatá a responder sobre a
            promoção quando alguém perguntar.
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Nova campanha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título interno</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Promo Bonito março"
              />
            </div>
            <div className="space-y-2">
              <Label>Linha WhatsApp</Label>
              <Select value={line} onValueChange={(v) => setLine(v as CampaignLine)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="descubra">Descubra MS</SelectItem>
                  <SelectItem value="viagens">Guatá Viagens</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Público (conversas existentes)</Label>
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as CampaignAudience)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AUDIENCE_LABEL) as CampaignAudience[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {AUDIENCE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              ~{preview?.count ?? "…"} contatos no filtro (máx. 80 por clique de envio).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Texto curto da promoção (vira legenda se houver cartaz)."
            />
          </div>

          <div className="space-y-2">
            <Label>Cartaz (opcional)</Label>
            <input
              ref={imageRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button type="button" variant="outline" onClick={() => imageRef.current?.click()}>
                <ImageIcon className="h-4 w-4 mr-2" />
                {imageFile ? imageFile.name : "Escolher imagem"}
              </Button>
              {imageFile && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setImageFile(null)}>
                  Remover
                </Button>
              )}
            </div>
          </div>

          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || (!body.trim() && !imageFile)}
          >
            <Send className="h-4 w-4 mr-2" />
            {createMut.isPending ? "Enviando lote…" : "Criar e enviar lote"}
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Campanhas recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-20 w-full" />}
          {!isLoading && (campaigns?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
          )}
          {campaigns?.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 flex flex-wrap gap-3 justify-between">
              <div className="space-y-1 min-w-0">
                <p className="font-medium truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{c.body || "—"}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline">{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  <Badge variant="secondary">{AUDIENCE_LABEL[c.audience as CampaignAudience]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    ✓ {c.sent_ok} · ✗ {c.sent_fail} · ⊘ {c.sent_skip}
                  </span>
                </div>
              </div>
              {c.status === "enviando" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => continueMut.mutate(c.id)}
                  disabled={continueMut.isPending}
                >
                  Continuar envio
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
