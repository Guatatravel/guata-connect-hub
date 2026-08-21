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