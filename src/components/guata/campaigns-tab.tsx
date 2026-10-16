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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, ImageIcon, Megaphone, Send } from "lucide-react";
import {
  campaignMetaStatusFn,
  createAndLaunchCampaignFn,
  launchCampaignFn,
  listCampaignsFn,
  previewCampaignAudienceFn,
} from "@/lib/campaigns.functions";
import type {
  CampaignAudience,
  CampaignLine,
  CampaignLineSelect,
} from "@/lib/campaigns.types";

const AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  active_24h: "Falaram nas últimas 24h (podem receber agora)",
  active_7d: "Falaram nos últimos 7 dias",
  active_30d: "Falaram nos últimos 30 dias",
  all_sessions: "Todas as conversas da linha",
};

const LINE_LABEL: Record<CampaignLine, string> = {
  descubra: "Descubra MS — Me Consulte",
  viagens: "Guatá viagens e turismo",
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

function sumStats(rows: { sent_ok: number; sent_fail: number; sent_skip: number }[]) {
  return rows.reduce(
    (a, r) => ({
      ok: a.ok + r.sent_ok,
      fail: a.fail + r.sent_fail,
      skip: a.skip + r.sent_skip,
    }),
    { ok: 0, fail: 0, skip: 0 },
  );
}

export function CampaignsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaignsFn);
  const previewFn = useServerFn(previewCampaignAudienceFn);
  const metaFn = useServerFn(campaignMetaStatusFn);
  const createLaunchFn = useServerFn(createAndLaunchCampaignFn);
  const launchFn = useServerFn(launchCampaignFn);
  const imageRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [line, setLine] = useState<CampaignLineSelect>("descubra");
  const [audience, setAudience] = useState<CampaignAudience>("active_7d");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listFn(),
  });

  const { data: meta } = useQuery({
    queryKey: ["campaign-meta-status"],
    queryFn: () => metaFn(),
  });

  const { data: preview } = useQuery({
    queryKey: ["campaign-audience", line, audience],
    queryFn: () => previewFn({ data: { line, audience } }),
  });

  const lineReady =
    line === "both"
      ? Boolean(meta?.descubra && meta?.viagens)
      : line === "descubra"
        ? Boolean(meta?.descubra)
        : Boolean(meta?.viagens);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      let imageBase64: string | undefined;
      let imageContentType: string | undefined;
      if (imageFile) {
        const img = await fileToBase64(imageFile);
        imageBase64 = img.base64;
        imageContentType = img.type;
      }
      return createLaunchFn({
        data: {
          title: title.trim() || "Campanha",
          line,
          body,
          audience,
          imageBase64,
          imageContentType,
        },
      });
    },
    onSuccess: ({ results }) => {
      const s = sumStats(results);
      const msg =
        `Envio: ${s.ok} ok, ${s.fail} falha, ${s.skip} fora da janela 24h` +
        (results.length > 1 ? ` (${results.length} campanhas)` : "");
      if (s.ok === 0) toast.warning(msg + " — veja a mensagem de erro ou a janela de 24h.");
      else toast.success(msg);
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
        <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
          <p>
            Envio para quem já tem conversa no número escolhido. A Meta só entrega texto/cartaz
            livre se o cliente falou nas <strong>últimas 24h</strong>; fora disso aparece como
            ignorado (templates virão depois).
          </p>
          <p>
            <strong>Para funcionar:</strong> secrets no Lovable —{" "}
            <code className="text-xs">META_ACCESS_TOKEN</code> +{" "}
            <code className="text-xs">META_PHONE_NUMBER_ID</code> (Descubra) e/ou sufixos{" "}
            <code className="text-xs">_VIAGENS</code> para Guatá Viagens; bucket{" "}
            <code className="text-xs">campaigns</code> público no Supabase se usar cartaz.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant={meta?.descubra ? "secondary" : "destructive"}>
              Descubra MS: {meta?.descubra ? "Meta OK" : "Meta pendente"}
            </Badge>
            <Badge variant={meta?.viagens ? "secondary" : "destructive"}>
              Guatá viagens e turismo: {meta?.viagens ? "Meta OK" : "Meta pendente"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {!lineReady && meta && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            A linha selecionada não tem WhatsApp configurado no servidor. Ajuste as variáveis Meta
            em Lovable (Configurações do projeto → Secrets) e publique de novo.
          </AlertDescription>
        </Alert>
      )}

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
                placeholder="Ex.: Promo site agência"
              />
            </div>
            <div className="space-y-2">
              <Label>Linha WhatsApp</Label>
              <Select value={line} onValueChange={(v) => setLine(v as CampaignLineSelect)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="descubra">{LINE_LABEL.descubra}</SelectItem>
                  <SelectItem value="viagens">{LINE_LABEL.viagens}</SelectItem>
                  <SelectItem value="both">Ambas as linhas (2 disparos)</SelectItem>
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
              ~{preview?.filterCount ?? "…"} no filtro ·{" "}
              <strong>{preview?.eligible24h ?? "…"} podem receber agora</strong> (falaram nas
              últimas 24h). Máx. 80 por linha por clique.
              {(preview?.filterCount ?? 0) === 0 &&
                " Nenhuma sessão nessa linha — use Descubra MS se suas conversas estão lá, ou “Todas as conversas”."}
              {(preview?.filterCount ?? 0) > 0 && (preview?.eligible24h ?? 0) === 0 &&
                " Ninguém na janela de 24h: mande um oi no WhatsApp hoje e dispare de novo."}
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
            disabled={
              createMut.isPending || !lineReady || (!body.trim() && !imageFile)
            }
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
                  <Badge variant="outline">{LINE_LABEL[c.line as CampaignLine]}</Badge>
                  <Badge variant="secondary">
                    {AUDIENCE_LABEL[c.audience as CampaignAudience]}
                  </Badge>
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
