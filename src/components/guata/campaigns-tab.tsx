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
import {
  AlertCircle,
  Copy,
  ImageIcon,
  Megaphone,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import {
  campaignMetaStatusFn,
  createAndLaunchCampaignFn,
  deleteCampaignFn,
  duplicateAndLaunchCampaignFn,
  launchCampaignFn,
  listCampaignsFn,
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
};

const LINE_LABEL: Record<CampaignLine, string> = {
  descubra: "Guatá",
  viagens: "Guatá",
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
  const saveDraftFn = useServerFn(saveCampaignDraftFn);
  const deleteFn = useServerFn(deleteCampaignFn);
  const duplicateFn = useServerFn(duplicateAndLaunchCampaignFn);
  const imageRef = useRef<HTMLInputElement>(null);

  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [savedImagePath, setSavedImagePath] = useState<string | null>(null);
  const [title, setTitle] = useState("");
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

  const loadCampaignIntoForm = (c: CampaignRow) => {
    setEditingDraftId(c.status === "rascunho" ? c.id : null);
    setSavedImagePath(c.image_path);
    setTitle(c.title.replace(/\s*·\s*(Descubra|Viagens)\s*$/i, "").trim());
    setLine(c.line as CampaignLine);
    setAudience(c.audience as CampaignAudience);
    setBody(c.body ?? "");
    setSendMode(c.send_mode === "template" ? "template" : "sessao");
    setTemplateName(c.template_name ?? "");
    setTemplateLanguage(c.template_language ?? "pt_BR");
    setTemplateUsesName(c.template_uses_name !== false);
    setExtraPhones(c.extra_phones ?? "");
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar"),
  });

  const launchDraftMut = useMutation({
    mutationFn: (id: string) => launchFn({ data: { id } }),
    onSuccess: (row) => {
      toast.success(
        `Envio: ${row.sent_ok} ok, ${row.sent_fail} falha, ${row.sent_skip} fora da janela 24h`,
      );
      invalidate();
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
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar"),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id } }),
    onSuccess: (row) => {
      toast.success(
        `Reenvio: ${row.sent_ok} ok, ${row.sent_fail} falha, ${row.sent_skip} fora da janela 24h`,
      );
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível reenviar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Campanha excluída.");
      invalidate();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir"),
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
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do template na Meta</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="ex.: convite_evento"
                />
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Input
                  value={templateLanguage}
                  onChange={(e) => setTemplateLanguage(e.target.value)}
                  placeholder="pt_BR"
                />
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={templateUsesName}
                  onChange={(e) => setTemplateUsesName(e.target.checked)}
                />
                O template tem uma variável de nome ({`{{1}}`})
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label>Telefones avulsos (opcional)</Label>
            <Textarea
              rows={3}
              value={extraPhones}
              onChange={(e) => setExtraPhones(e.target.value)}
              placeholder={"Um número por linha, com DDD.\nSe preencher, só estes números recebem — inclusive quem nunca chamou o Guatá."}
            />
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
              {extraPhones.trim()
                ? "A lista de telefones substitui o público. Máx. 80 números."
                : sendMode === "template"
                  ? `~${preview?.filterCount ?? "…"} conversas podem receber o template, mesmo fora das 24h. Máx. 80 por clique.`
                  : `~${preview?.filterCount ?? "…"} no filtro · ${preview?.eligible24h ?? "…"} podem receber agora (falaram nas últimas 24h). Máx. 80 por linha por clique.`}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                sendMode === "template"
                  ? "Texto só para o painel. Use {nome} onde entra o primeiro nome."
                  : "Texto curto da promoção (vira legenda se houver cartaz)."
              }
            />
          </div>

          {sendMode === "sessao" && <div className="space-y-2">
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
              {savedImagePath && !imageFile && (
                <span className="text-xs text-muted-foreground">Cartaz salvo no rascunho</span>
              )}
            </div>
          </div>}

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
                  <Badge variant="outline">{c.send_mode === "template" ? "Template" : "Sessão 24h"}</Badge>
                  <Badge variant="secondary">
                    {AUDIENCE_LABEL[c.audience as CampaignAudience]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    ✓ {c.sent_ok} · ✗ {c.sent_fail} · ⊘ {c.sent_skip}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-start">
                {c.status === "rascunho" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => launchDraftMut.mutate(c.id)}
                      disabled={launchDraftMut.isPending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Enviar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadCampaignIntoForm(c)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                  </>
                )}
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
                {c.status === "concluida" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => duplicateMut.mutate(c.id)}
                    disabled={duplicateMut.isPending}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Enviar de novo
                  </Button>
                )}
                {c.status !== "rascunho" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => loadCampaignIntoForm(c)}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Usar no formulário
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Excluir a campanha "${c.title}"?`)) {
                      deleteMut.mutate(c.id);
                      if (editingDraftId === c.id) resetForm();
                    }
                  }}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
