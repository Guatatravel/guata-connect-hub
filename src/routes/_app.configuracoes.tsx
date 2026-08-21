import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trash2, Plus, CheckCircle2, XCircle, Copy, Volume2, VolumeX, Info, Lock } from "lucide-react";
import type { AgencyService } from "@/types/guata";
import {
  isSoundEnabled,
  setSoundEnabled,
} from "@/hooks/use-realtime-notifications";

// URL pública estável (não muda ao renomear o projeto).
const STABLE_PUBLIC_URL =
  "https://project--16a8412a-83f5-4d18-bc70-414943f20be8.lovable.app";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfigPage,
});

function ConfigPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: () => api.listServices(),
  });

  const [personaDescubra, setPersonaDescubra] = useState("");
  const [personaViagens, setPersonaViagens] = useState("");
  const [horario, setHorario] = useState("");
  const [foraHorario, setForaHorario] = useState("");
  const [msgHumano, setMsgHumano] = useState("");

  useEffect(() => {
    if (settings) {
      setPersonaDescubra(settings.personaDescubra);
      setPersonaViagens(settings.personaViagens);
      setHorario(settings.horarioAtendimento);
      setForaHorario(settings.mensagemForaHorario);
      setMsgHumano(settings.mensagemHumano);
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () =>
      api.updateSettings({
        personaDescubra,
        personaViagens,
        horarioAtendimento: horario,
        mensagemForaHorario: foraHorario,
        mensagemHumano: msgHumano,
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const upsertSvc = useMutation({
    mutationFn: (svc: AgencyService) => api.upsertService(svc),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
  const deleteSvc = useMutation({
    mutationFn: (id: string) => api.deleteService(id),
    onSuccess: () => {
      toast.success("Serviço removido");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
  });

  if (isLoading || !settings) return <Skeleton className="h-96 rounded-2xl" />;

  // Sempre a URL publicada estável — não usar window.location.origin
  // (senão no preview aparece uma URL inválida para colar nos webhooks externos).
  const whatsappWebhook = `${STABLE_PUBLIC_URL}/api/public/webhooks/whatsapp`;
  const descubraWebhook = `${STABLE_PUBLIC_URL}/api/public/webhooks/descubra-ms`;

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">
          Configurações
        </h1>
        <p className="text-muted-foreground">
          Status das integrações, personas do bot, horário e serviços da agência.
        </p>
      </div>

      <Card className="rounded-2xl border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex gap-3 items-start text-sm">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-primary">Como ler esta tela</p>
            <p className="text-muted-foreground">
              Os campos com <Lock className="inline h-3 w-3" /> são <strong>só-leitura</strong> —
              são URLs geradas pelo sistema. Você deve <strong>copiar e colar</strong> essas URLs
              nos painéis externos (Meta Developers e Supabase do Descubra MS). O que é editável
              aqui: personas, horário, mensagens automáticas, serviços e notificações.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display flex items-center justify-between gap-2 flex-wrap">
            Integração WhatsApp Business (Meta)
            <div className="flex gap-2">
              <StatusBadge
                state={settings.metaConfiguredDescubra ? "ok" : "warn"}
                label="Linha Descubra"
              />
              <StatusBadge
                state={settings.metaConfiguredViagens ? "ok" : "idle"}
                label={settings.metaConfiguredViagens ? "Linha Viagens" : "Linha Viagens (não usada)"}
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Webhook para colar no Meta App (Configurations → Webhooks → WhatsApp Business)
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={whatsappWebhook}
                className="font-mono text-xs bg-muted cursor-default"
                onFocus={(e) => e.target.select()}
              />
              <Button size="sm" variant="outline" onClick={() => copy(whatsappWebhook)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Verify Token: use o valor que você definiu como secret <code className="text-[10px]">META_VERIFY_TOKEN</code>.
              Subscreva o campo <code className="text-[10px]">messages</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display flex items-center justify-between gap-2 flex-wrap">
            Integração Descubra MS
            <div className="flex gap-2">
              <StatusBadge
                state={settings.descubraSupabaseConfigured ? "ok" : "warn"}
                label="Banco Descubra"
              />
              <StatusBadge
                state={settings.descubraCanalWebhookReady ? "ok" : "warn"}
                label="Webhook eventos"
              />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              URL para o Database Webhook no Supabase do Descubra MS
            </Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={descubraWebhook}
                className="font-mono text-xs bg-muted cursor-default"
                onFocus={(e) => e.target.select()}
              />
              <Button size="sm" variant="outline" onClick={() => copy(descubraWebhook)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Adicione o header <code className="text-[10px]">Authorization: Bearer &lt;DESCUBRA_WEBHOOK_SECRET&gt;</code>{" "}
              (valor já configurado nos secrets). Eventos: INSERT/UPDATE na tabela de eventos.
            </p>
          </div>
        </CardContent>
      </Card>

      <DiagnosticsCard />

      <BrandingCard />

      <NotificationSettingsCard />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display">Personas e horário do bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Persona — Linha Descubra MS</Label>
            <Textarea
              rows={4}
              value={personaDescubra}
              onChange={(e) => setPersonaDescubra(e.target.value)}
              placeholder="Sou o Guatá, assistente turístico oficial..."
            />
          </div>
          <div className="space-y-2">
            <Label>Persona — Linha Viagens</Label>
            <Textarea
              rows={4}
              value={personaViagens}
              onChange={(e) => setPersonaViagens(e.target.value)}
              placeholder="Sou consultor da agência..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Horário de atendimento</Label>
              <Input
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                placeholder="Seg a Sex, 8h às 18h"
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem fora do horário</Label>
              <Input
                value={foraHorario}
                onChange={(e) => setForaHorario(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mensagem ao acionar "humano"</Label>
            <Input value={msgHumano} onChange={(e) => setMsgHumano(e.target.value)} />
          </div>
          <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
            Salvar alterações
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display flex items-center justify-between">
            Serviços da agência (Guatá Viagens)
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                upsertSvc.mutate({
                  id: `s-${Date.now()}`,
                  nome: "Novo serviço",
                  descricao: "",
                  categoria: "",
                  keywords: [],
                  ativo: true,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {services?.map((s) => (
            <ServiceRow
              key={s.id}
              service={s}
              onSave={(svc) =>
                upsertSvc.mutate(svc, {
                  onSuccess: () => toast.success("Serviço atualizado"),
                })
              }
              onDelete={() => deleteSvc.mutate(s.id)}
            />
          ))}
          {services?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum serviço cadastrado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticsCard() {
  const run = useServerFn(runDescubraDiagnostics);
  const test = useServerFn(sendTestDescubraEvent);
  const qc = useQueryClient();

  const diag = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => run({ data: undefined as never }),
    staleTime: 0,
  });

  const testEvent = useMutation({
    mutationFn: () => test({ data: undefined as never }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message);
        qc.invalidateQueries({ queryKey: ["diagnostics"] });
        qc.invalidateQueries({ queryKey: ["channel-posts"] });
      } else {
        toast.error(r.message);
      }
    },
    onError: () => toast.error("Falha ao enviar evento de teste"),
  });

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-display flex items-center justify-between gap-2 flex-wrap">
          Teste de conexão — está funcionando?
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => diag.refetch()}
              disabled={diag.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${diag.isFetching ? "animate-spin" : ""}`}
              />
              Testar agora
            </Button>
            <Button
              size="sm"
              onClick={() => testEvent.mutate()}
              disabled={testEvent.isPending}
            >
              <Send className="h-4 w-4 mr-1" />
              Enviar evento de teste
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {diag.isLoading && <Skeleton className="h-40 rounded-xl" />}
        {diag.isError && (
          <p className="text-destructive">
            Não foi possível rodar o diagnóstico agora.
          </p>
        )}
        {diag.data?.checks.map((c) => (
          <div
            key={c.id}
            className="flex gap-3 items-start border border-border rounded-xl p-3 bg-secondary/30"
          >
            {c.state === "ok" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : c.state === "warn" ? (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">{c.label}</p>
              <p className="text-muted-foreground">{c.detail}</p>
              {c.hint && (
                <p className="text-xs text-muted-foreground/80 italic">{c.hint}</p>
              )}
            </div>
          </div>
        ))}
        {diag.data && (
          <p className="text-xs text-muted-foreground">
            Última verificação:{" "}
            {new Date(diag.data.ranAt).toLocaleString("pt-BR")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BrandingCard() {
  const qc = useQueryClient();
  const { data: logoUrl, isLoading } = useLogoUrl();
  const upload = useServerFn(uploadLogo);
  const reset = useServerFn(resetLogo);
  const [busy, setBusy] = useState(false);

  const afterChange = () => {
    qc.invalidateQueries({ queryKey: logoQueryKey });
  };

  const onFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem precisa ter no máximo 2 MB.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG, WEBP ou SVG.");
      return;
    }
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
      await upload({
        data: { base64: btoa(bin), contentType: file.type as never },
      });
      afterChange();
      toast.success("Logo atualizada");
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.includes("administradores")
          ? "Apenas administradores podem trocar a logo."
          : "Falha ao enviar a logo",
      );
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    setBusy(true);
    try {
      await reset({ data: undefined as never });
      afterChange();
      toast.success("Logo padrão restaurada");
    } catch {
      toast.error("Falha ao restaurar a logo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-display">Identidade visual</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-4">
          {isLoading ? (
            <Skeleton className="h-16 w-16 rounded-full" />
          ) : (
            <BrandLogo className="h-16 w-16 text-3xl" />
          )}
          <div className="space-y-1">
            <p className="font-medium text-foreground">Logo do portal</p>
            <p className="text-muted-foreground text-xs">
              Aparece na barra lateral e na tela de login. PNG, JPG, WEBP ou SVG
              de até 2 MB. Só administradores podem alterar.
            </p>
            <p className="text-muted-foreground text-xs">
              {logoUrl ? "Logo personalizada ativa." : "Usando a logo padrão."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button asChild size="sm" disabled={busy}>
              <span>
                <ImageIcon className="h-4 w-4 mr-1" />
                Enviar nova logo
              </span>
            </Button>
          </label>
          {logoUrl && (
            <Button size="sm" variant="outline" onClick={onReset} disabled={busy}>
              Restaurar padrão
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  state,
  label,
}: {
  state: "ok" | "warn" | "idle";
  label: string;
}) {
  const cls =
    state === "ok"
      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
      : state === "warn"
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={cls}>
      {state === "ok" ? (
        <CheckCircle2 className="h-3 w-3 mr-1" />
      ) : state === "warn" ? (
        <XCircle className="h-3 w-3 mr-1" />
      ) : (
        <Info className="h-3 w-3 mr-1" />
      )}
      {label}
    </Badge>
  );
}

function NotificationSettingsCard() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return isSoundEnabled();
  });
  useEffect(() => {
    setSoundEnabled(enabled);
  }, [enabled]);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="font-display">Notificações do painel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {enabled ? (
              <Volume2 className="h-5 w-5 text-primary mt-0.5" />
            ) : (
              <VolumeX className="h-5 w-5 text-muted-foreground mt-0.5" />
            )}
            <div>
              <p className="font-medium text-foreground">Som de alerta</p>
              <p className="text-muted-foreground text-xs">
                Toca um bip curto quando chega uma nova triagem ou um cliente pede atendimento humano.
                Preferência salva neste navegador.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="text-xs text-muted-foreground border-t border-border/50 pt-3">
          <strong className="text-foreground">Como funciona:</strong> mesmo com o painel fechado, o
          Guatá continua respondendo no WhatsApp e gravando triagens no banco. Ao abrir o painel,
          os contadores nos menus <em>Triagens</em> e <em>Conversas</em> mostram quantos itens
          estão aguardando você. Enquanto o painel está aberto, notificações e som aparecem em
          tempo real.
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceRow({
  service,
  onSave,
  onDelete,
}: {
  service: AgencyService;
  onSave: (s: AgencyService) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(service);
  useEffect(() => setDraft(service), [service]);

  return (
    <div className="border border-border rounded-xl p-3 space-y-2 bg-secondary/30">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input
          value={draft.nome}
          onChange={(e) => setDraft({ ...draft, nome: e.target.value })}
          placeholder="Nome"
        />
        <Input
          value={draft.categoria ?? ""}
          onChange={(e) => setDraft({ ...draft, categoria: e.target.value })}
          placeholder="Categoria"
        />
      </div>
      <Input
        value={(draft.keywords ?? []).join(", ")}
        onChange={(e) =>
          setDraft({
            ...draft,
            keywords: e.target.value
              .split(",")
              .map((r) => r.trim())
              .filter(Boolean),
          })
        }
        placeholder="Palavras-chave (vírgula)"
      />
      <Textarea
        rows={2}
        value={draft.descricao}
        onChange={(e) => setDraft({ ...draft, descricao: e.target.value })}
        placeholder="Descrição"
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.ativo}
            onCheckedChange={(v) => setDraft({ ...draft, ativo: v })}
          />
          <Label className="text-sm">{draft.ativo ? "Ativo" : "Inativo"}</Label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => onSave(draft)}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}