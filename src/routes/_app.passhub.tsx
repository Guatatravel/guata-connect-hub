import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BedDouble, Bus, ExternalLink, KeyRound, Plane, ShieldCheck, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPasshubSettings, savePasshubSettings } from "@/lib/passhub.functions";
import { PASSHUB_REFERRAL_URL, type PasshubSettingsView } from "@/lib/passhub.shared";

export const Route = createFileRoute("/_app/passhub")({
  head: () => ({
    meta: [
      { title: "Passhub — Guatá Channel" },
      {
        name: "description",
        content: "Conecte o Passhub para cotar passagens, hotéis, seguro viagem e ônibus com o Guatá.",
      },
      { property: "og:title", content: "Passhub — Guatá Channel" },
      {
        property: "og:description",
        content: "Passagens, hotéis, seguro viagem e rodoviário integrados ao atendimento do Guatá.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PasshubPage,
});

type Form = Omit<PasshubSettingsView, "hasApiKey" | "apiKeyHint" | "canEdit"> & {
  apiKey: string;
};

const VALIDITY_PRESETS = [15, 20, 30];

function PasshubPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchPasshubSettings);
  const saveFn = useServerFn(savePasshubSettings);
  const { data, isLoading } = useQuery({ queryKey: ["passhub"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (data && !form) {
      const { hasApiKey: _h, apiKeyHint: _a, canEdit: _c, ...rest } = data;
      setForm({ ...rest, apiKey: "" });
    }
  }, [data, form]);

  const save = useMutation({
    mutationFn: (f: Form & { clearApiKey?: boolean }) =>
      saveFn({ data: { ...f, apiKey: f.apiKey || null } }),
    onSuccess: () => {
      toast.success("Passhub salvo");
      setForm((f) => (f ? { ...f, apiKey: "" } : f));
      qc.invalidateQueries({ queryKey: ["passhub"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar"),
  });

  if (isLoading || !data || !form) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const disabled = !data.canEdit || save.isPending;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display text-3xl font-semibold text-primary">Passhub</h1>
        <p className="text-muted-foreground">Passagens aéreas, hotéis, seguro viagem e ônibus no atendimento do Guatá.</p>
      </div>

      <Card className="rounded-2xl border-accent/50 bg-accent/10">
        <CardContent className="p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="flex-1 space-y-1">
            <div className="font-medium">Ainda não tem conta no Passhub?</div>
            <p className="text-sm text-muted-foreground">
              É a plataforma de emissão que reúne várias consolidadoras em um só lugar, sem custo para a agência.
              Crie sua conta por este link de indicação.
            </p>
          </div>
          <Button asChild variant="default">
            <a href={PASSHUB_REFERRAL_URL} target="_blank" rel="noopener noreferrer">
              Criar conta no Passhub <ExternalLink className="h-4 w-4 ml-1" />
            </a>
          </Button>
        </CardContent>
      </Card>

      {!data.canEdit && (
        <p className="text-sm text-center text-muted-foreground">
          Só o dono ou administrador da agência pode alterar estas opções.
        </p>
      )}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-accent" /> Conexão
            {data.hasApiKey ? <Badge variant="secondary">Chave salva {data.apiKeyHint}</Badge> : <Badge variant="outline">Sem chave</Badge>}
          </CardTitle>
          <CardDescription>Cole a chave de acesso que o Passhub fornece para a sua agência.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Usar o Passhub nesta agência" checked={form.enabled} onChange={(v) => set("enabled", v)} disabled={disabled} />
          <div className="space-y-1.5">
            <Label htmlFor="passhub-key">Chave do Passhub</Label>
            <div className="flex gap-2">
              <Input
                id="passhub-key"
                type="password"
                autoComplete="off"
                placeholder={data.hasApiKey ? "Deixe em branco para manter a chave atual" : "Cole a chave aqui"}
                value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                disabled={disabled}
              />
              {data.hasApiKey && (
                <Button variant="outline" disabled={disabled} onClick={() => save.mutate({ ...form, apiKey: "", clearApiKey: true })}>
                  Remover
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">O que o Guatá pode cotar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Module icon={Plane} label="Passagens aéreas" checked={form.modAereo} onChange={(v) => set("modAereo", v)} disabled={disabled} />
          <Module icon={BedDouble} label="Hospedagem" checked={form.modHotel} onChange={(v) => set("modHotel", v)} disabled={disabled} />
          <Module icon={ShieldCheck} label="Seguro viagem" checked={form.modSeguro} onChange={(v) => set("modSeguro", v)} disabled={disabled} />
          <Module icon={Bus} label="Passagens de ônibus" checked={form.modRodoviario} onChange={(v) => set("modRodoviario", v)} disabled={disabled} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Autonomia do Guatá</CardTitle>
          <CardDescription>Você decide até onde o Guatá vai sozinho.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row
            label="Buscar tarifas sozinho"
            hint="Desligado: o Guatá só coleta o briefing e o consultor faz a cotação."
            checked={form.autoSearch}
            onChange={(v) => set("autoSearch", v)}
            disabled={disabled}
          />
          <Row
            label="Enviar link de pagamento ao cliente"
            hint="Desligado: o consultor confere e envia o link. Recomendado deixar desligado no começo."
            checked={form.autoPayment}
            onChange={(v) => set("autoPayment", v)}
            disabled={disabled}
          />
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-accent" /> Prazo para pagamento da cotação
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {VALIDITY_PRESETS.map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={form.quoteValidityMinutes === m ? "default" : "outline"}
                  onClick={() => set("quoteValidityMinutes", m)}
                  disabled={disabled}
                >
                  {m} min
                </Button>
              ))}
              <Input
                type="number"
                min={5}
                max={120}
                className="w-24"
                value={form.quoteValidityMinutes}
                onChange={(e) => set("quoteValidityMinutes", Math.min(120, Math.max(5, Number(e.target.value) || 15)))}
                disabled={disabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Toda cotação sai com este prazo e com o aviso de que os valores podem mudar sem aviso prévio.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-muted/50">
        <CardContent className="p-4 text-sm text-muted-foreground">
          A busca automática de tarifas começa a funcionar quando o Passhub liberar o acesso de integração para a sua
          conta. Até lá, o Guatá coleta o briefing e o consultor monta a cotação no padrão de 3 opções dentro da conversa.
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button size="lg" disabled={disabled} onClick={() => save.mutate(form)}>
          {save.isPending ? "Salvando…" : "Salvar Passhub"}
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Module({
  icon: Icon,
  label,
  checked,
  onChange,
  disabled,
}: {
  icon: typeof Plane;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background/60 p-3">
      <Icon className="h-4 w-4 text-primary" />
      <span className="flex-1 text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
