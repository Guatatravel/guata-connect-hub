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
import { Trash2, Plus, CheckCircle2, XCircle } from "lucide-react";
import type { AgencyService } from "@/types/guata";

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

  const [welcome, setWelcome] = useState("");
  const [triggers, setTriggers] = useState("");

  useEffect(() => {
    if (settings) {
      setWelcome(settings.mensagemBoasVindas);
      setTriggers(settings.palavrasGatilhoTriagem.join(", "));
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: () =>
      api.updateSettings({
        mensagemBoasVindas: welcome,
        palavrasGatilhoTriagem: triggers
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">
          Configurações
        </h1>
        <p className="text-muted-foreground">
          Conexão Meta, mensagens do bot, gatilhos de triagem e serviços da agência.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display flex items-center justify-between">
            Conexão WhatsApp Business (Meta Cloud API)
            <Badge
              variant="outline"
              className={
                settings.metaStatus === "conectado"
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                  : "bg-destructive/10 text-destructive border-destructive/30"
              }
            >
              {settings.metaStatus === "conectado" ? (
                <CheckCircle2 className="h-3 w-3 mr-1" />
              ) : (
                <XCircle className="h-3 w-3 mr-1" />
              )}
              {settings.metaStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Webhook Descubra MS
            </Label>
            <Input readOnly value={settings.webhookDescubraUrl} className="font-mono text-xs" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Webhook Guatá Viagens
            </Label>
            <Input readOnly value={settings.webhookViagensUrl} className="font-mono text-xs" />
          </div>
          <p className="text-xs text-muted-foreground">
            Canal (eventos → posts):{" "}
            {settings.descubraCanalWebhookReady ? (
              <span className="text-emerald-700 font-medium">ativa</span>
            ) : (
              <span className="text-amber-700 font-medium">
                pendente — configure Database Webhook no Supabase Descubra apontando
                para a URL acima com o mesmo{" "}
                <code className="text-[10px]">DESCUBRA_WEBHOOK_SECRET</code> da API
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Guia: <code className="text-[10px]">guata-channel-api/integrations/descubra-ms/README.md</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Base de conhecimento do chat: admin do Descubra MS (Supabase na API).
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="font-display">Mensagens e gatilhos do bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mensagem de boas-vindas</Label>
            <Textarea
              rows={4}
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Palavras-gatilho para triagem comercial</Label>
            <Input
              value={triggers}
              onChange={(e) => setTriggers(e.target.value)}
              placeholder="quero viagem, pacote, orçamento"
            />
            <p className="text-xs text-muted-foreground">
              Separadas por vírgula. Quando o cliente menciona uma delas, o bot
              entra em modo triagem e coleta os dados da viagem.
            </p>
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
                  regioes: [],
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
          value={draft.regioes.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              regioes: e.target.value.split(",").map((r) => r.trim()).filter(Boolean),
            })
          }
          placeholder="Regiões (vírgula)"
        />
      </div>
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