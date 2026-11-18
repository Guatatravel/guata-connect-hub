import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { WhatsappTemplateCampaignFields } from "@/components/guata/whatsapp-template-campaign-fields";
import {
  campaignMetaStatusFn,
  createAndLaunchCampaignFn,
  launchCampaignFn,
  previewCampaignAudienceFn,
  saveCampaignDraftFn,
} from "@/lib/campaigns.functions";
import type {
  CampaignAudience,
  CampaignLine,
  CampaignLineSelect,
  CampaignRow,
  CampaignSendMode,
} from "@/lib/campaigns.types";

const AUDIENCE_LABEL: Record<CampaignAudience, string> = {
  active_24h: "Falaram nas últimas 24h (podem receber agora)",
  active_7d: "Falaram nos últimos 7 dias",
  active_30d: "Falaram nos últimos 30 dias",
  all_sessions: "Todas as conversas da linha",
  phone_list: "Só lista de telefones (quem nunca falou no Guatá)",
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
  const previewFn = useServerFn(previewCampaignAudienceFn);
  const metaFn = useServerFn(campaignMetaStatusFn);
  const createLaunchFn = useServerFn(createAndLaunchCampaignFn);
  const launchFn = useServerFn(launchCampaignFn);
  const saveDraftFn = useServerFn(saveCampaignDraftFn);
  const imageRef = useRef<HTMLInputElement>(null);

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // Linha única: o WhatsApp oficial do Guatá.
  const [line, setLine] = useState<CampaignLineSelect>("descubra");
  const [audience, setAudience] = useState<CampaignAudience>("active_7d");
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sendMode, setSendMode] = useState<CampaignSendMode>("sessao");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [templateUsesName, setTemplateUsesName] = useState(true);
  const [extraPhones, setExtraPhones] = useState("");

  const resetForm = () => {
    setEditingDraftId(null);
    setSavedImagePath(null);
    setTitle("");
    setBody("");
    setImageFile(null);
    setLine("descubra");
    setAudience("active_7d");
    setSendMode("sessao");
    setTemplateName("");
    setTemplateLanguage("pt_BR");
    setTemplateUsesName(true);
    setExtraPhones("");
  };

  const { data: meta } = useQuery({
    queryKey: ["campaign-meta-status"],
    queryFn: () => metaFn(),
  });

  const { data: preview } = useQuery({
    queryKey: ["campaign-audience", line, audience, extraPhones],
    queryFn: () => previewFn({ data: { line, audience, extraPhones } }),
  });

  const lineReady =
    line === "both"
      ? Boolean(meta?.descubra && meta?.viagens)
      : line === "descubra"
        ? Boolean(meta?.descubra)
        : Boolean(meta?.viagens);

  const imagePayload = async () => {
    if (!imageFile) return {};
    const img = await fileToBase64(imageFile);
    return { imageBase64: img.base64, imageContentType: img.type };
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const images = await imagePayload();
      const payload = {
        title: title.trim() || "Campanha",
        line,
        body,
        audience,
        sendMode,
        templateName,
        templateLanguage,
        templateUsesName,
        extraPhones,
        ...images,
      };
      if (editingDraftId) {
        if (line === "both") {
          throw new Error("Edição de rascunho só em uma linha (Descubra ou Viagens).");
        }
        await saveDraftFn({
          data: { id: editingDraftId, ...payload, line: line as CampaignLine },
        });
        return launchFn({ data: { id: editingDraftId } });
      }
      return createLaunchFn({ data: payload });
    },
    onSuccess: (result) => {
      if (result && "results" in result && result.results) {
        const s = sumStats(result.results);
        const msg =
          `Envio: ${s.ok} ok, ${s.fail} falha, ${s.skip} fora da janela 24h` +
          (result.results.length > 1 ? ` (${result.results.length} campanhas)` : "");
        if (s.ok === 0) toast.warning(msg + " — veja a mensagem de erro ou a janela de 24h.");
        else toast.success(msg);
      } else {
        const row = result as CampaignRow;
        toast.success(
          `Envio: ${row.sent_ok} ok, ${row.sent_fail} falha, ${row.sent_skip} fora da janela 24h`,
        );
      }
      resetForm();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar"),
  });

  const saveDraftMut = useMutation({
    mutationFn: async () => {
      const images = await imagePayload();
      return saveDraftFn({
        data: {
          id: editingDraftId ?? undefined,
          title: title.trim() || "Campanha",
          line: line === "both" ? "descubra" : line,
          body,
          audience,
          sendMode,
          templateName,
          templateLanguage,
          templateUsesName,
          extraPhones,
          ...images,
        },
      });
    },
    onSuccess: (row) => {
      setEditingDraftId(row.id);
      setSavedImagePath(row.image_path);
      setImageFile(null);
      toast.success("Rascunho salvo.");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar"),
  });

  return (
    <div className="space-y-6">
      {!lineReady && meta && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            O WhatsApp oficial do Guatá ainda não está conectado. Conclua a conexão em
            "Conectar WhatsApp" antes de disparar.
          </AlertDescription>
        </Alert>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            {editingDraftId ? "Editar rascunho" : "Nova campanha"}
          </CardTitle>
          {editingDraftId && (
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancelar edição
            </Button>
          )}
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
              <Label>Enviar pelo</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                Guatá (WhatsApp Oficial)
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modo de envio</Label>
            <Select value={sendMode} onValueChange={(v) => setSendMode(v as CampaignSendMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sessao">Sessão — texto livre, só quem falou nas últimas 24h</SelectItem>
                <SelectItem value="template">Template — modelo aprovado, mesmo sem conversa aberta</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {sendMode === "template"
                ? "O texto do modelo fica travado na Meta. Aqui você informa o nome aprovado. {nome} vira o primeiro nome da pessoa. A Meta cobra cada mensagem de marketing e exige que a pessoa tenha aceitado receber."
                : "Mensagem livre (texto ou cartaz). A Meta só entrega se a pessoa falou com este número nas últimas 24 horas."}
            </p>
          </div>

          {sendMode === "template" && (
            <WhatsappTemplateCampaignFields
              templateName={templateName}
              templateLanguage={templateLanguage}
              templateUsesName={templateUsesName}
              onSelect={(name, lang, usesName) => {
                setTemplateName(name);
                setTemplateLanguage(lang);
                setTemplateUsesName(usesName);
              }}
              onUsesNameChange={setTemplateUsesName}
            />
          )}

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
                {(Object.keys(AUDIENCE_LABEL) as CampaignAudience[])
                  .filter((k) => sendMode === "template" || k !== "phone_list")
                  .map((k) => (
                  <SelectItem key={k} value={k}>
                    {AUDIENCE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {audience === "phone_list"
                ? `~${preview?.extraCount ?? preview?.filterCount ?? "…"} número(s) na lista. Máx. 80 por clique. Com template, novas conversas ficam com o Guatá (não entram em fila humana).`
                : extraPhones.trim()
                  ? sendMode === "template"
                    ? `~${preview?.filterCount ?? "…"} destinos (público + lista). Máx. 80 por clique.`
                    : "Lista soma ao público. Máx. 80 por clique."
                  : sendMode === "template"
                    ? `~${preview?.filterCount ?? "…"} podem receber o template (sem regra das 24h). Máx. 80 por clique.`
                    : `~${preview?.filterCount ?? "…"} no filtro · ${preview?.eligible24h ?? "…"} podem receber agora (24h). Máx. 80 por clique.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              {audience === "phone_list"
                ? "Lista de telefones (obrigatório)"
                : sendMode === "template"
                  ? "Telefones extras (opcional — somam ao público)"
                  : "Telefones avulsos (opcional)"}
            </Label>
            <Textarea
              rows={4}
              value={extraPhones}
              onChange={(e) => setExtraPhones(e.target.value)}
              placeholder={
                audience === "phone_list"
                  ? "Um número por linha (pode usar espaço ou hífen).\nEx.: 67 99248-3469\n     67984061395\n     55679984061395"
                  : "Um número por linha.\nNo modo template, somam ao público escolhido acima."
              }
            />
            {audience === "phone_list" && (
              <p className="text-xs text-muted-foreground">
                Formato: DDD + número na mesma linha. O contador acima deve mostrar quantos números foram
                reconhecidos antes de enviar.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                sendMode === "template"
                  ? "Opcional: nota no painel e contexto da IA. O cliente vê o cartão aprovado na Meta; use {nome} se quiser."
                  : "Texto curto da promoção (vira legenda se houver cartaz)."
              }
            />
          </div>

          <div className="space-y-2">
            <Label>
              {sendMode === "template" ? "Imagem do cabeçalho (só se o template aprovado tiver imagem)" : "Cartaz (opcional)"}
            </Label>
            {sendMode === "template" && (
              <p className="text-xs text-muted-foreground">
                Se o modelo foi cadastrado com imagem no topo, anexe de novo aqui a cada disparo (a Meta
                baixa esta imagem no envio). O painel não reproduz o cartão visual — só um resumo do texto.
              </p>
            )}
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
              {savedImagePath && !imageFile && (
                <span className="text-xs text-muted-foreground">Cartaz salvo no rascunho</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => createMut.mutate()}
              disabled={
                createMut.isPending ||
                !lineReady ||
                (sendMode === "template"
                  ? !templateName.trim()
                  : !body.trim() && !imageFile && !savedImagePath)
              }
            >
              <Send className="h-4 w-4 mr-2" />
              {createMut.isPending ? "Enviando lote…" : editingDraftId ? "Salvar e enviar" : "Criar e enviar lote"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => saveDraftMut.mutate()}
              disabled={
                saveDraftMut.isPending ||
                line === "both" ||
                (!body.trim() && !imageFile && !savedImagePath)
              }
            >
              Salvar rascunho
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
