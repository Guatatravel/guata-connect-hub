import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BedDouble, Bus, ExternalLink, Mail, Phone, Plane, ShieldCheck, Timer } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPasshubSettings, savePasshubSettings } from "@/lib/passhub.functions";
import {
  PASSHUB_PRODUCTS,
  PASSHUB_PRODUCT_LABEL,
  PASSHUB_REFERRAL_URL,
  type PasshubProduct,
  type PasshubSettingsView,
} from "@/lib/passhub.shared";

export const Route = createFileRoute("/_app/passhub")({
  head: () => ({
    meta: [
      { title: "Passhub — Guatá Channel" },
      {
        name: "description",
        content: "Conecte o Passhub com uma chave por produto: aéreo, hotel, seguro viagem e ônibus.",
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

type ProductForm = { enabled: boolean; apiKey: string; clearKey?: boolean };
type Form = {
  enabled: boolean;
  products: Record<PasshubProduct, ProductForm>;
  autoSearch: boolean;
  autoPayment: boolean;
  quoteValidityMinutes: number;
  agencyContactEmail: string;
  agencyContactPhone: string;
};

const VALIDITY_PRESETS = [15, 20, 30];
const ICONS: Record<PasshubProduct, typeof Plane> = {
  aereo: Plane,
  hotel: BedDouble,
  seguro: ShieldCheck,
  rodoviario: Bus,
};

function toForm(d: PasshubSettingsView): Form {
  const products = Object.fromEntries(
    PASSHUB_PRODUCTS.map((p) => [p, { enabled: d.products[p].enabled, apiKey: "" }]),
  ) as Form["products"];
  return {
    enabled: d.enabled,
    products,
    autoSearch: d.autoSearch,
    autoPayment: d.autoPayment,
    quoteValidityMinutes: d.quoteValidityMinutes,
    agencyContactEmail: d.agencyContactEmail,
    agencyContactPhone: d.agencyContactPhone,
  };
}

function PasshubPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(fetchPasshubSettings);
  const saveFn = useServerFn(savePasshubSettings);
  const { data, isLoading } = useQuery({ queryKey: ["passhub"], queryFn: () => fetchFn() });
  const [form, setForm] = useState<Form | null>(null);

  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  const save = useMutation({
    mutationFn: (f: Form) =>
      saveFn({
        data: {
          ...f,
          products: Object.fromEntries(
            PASSHUB_PRODUCTS.map((p) => [
              p,
              { enabled: f.products[p].enabled, apiKey: f.products[p].apiKey || null, clearKey: f.products[p].clearKey },
            ]),
          ) as Record<PasshubProduct, { enabled: boolean; apiKey: string | null; clearKey?: boolean }>,
        },
      }),
    onSuccess: () => {
      toast.success("Passhub salvo");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["passhub"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível salvar"),
  });

  if (isLoading || !data || !form) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64 mx-auto" />
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const setProduct = (p: PasshubProduct, patch: Partial<ProductForm>) =>
    setForm({ ...form, products: { ...form.products, [p]: { ...form.products[p], ...patch } } });
  const disabled = !data.canEdit || save.isPending;
  const keysSaved = PASSHUB_PRODUCTS.filter((p) => data.products[p].hasKey).length;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5">
      <div className="text-center space-y-1">
        <h1 className="font-display text-3xl font-semibold text-primary">Passhub</h1>
        <p className="text-muted-foreground">Uma chave para cada produto. O Guatá só usa o que estiver ligado e com chave.</p>
      </div>

      <Card className="rounded-2xl border-accent/50 bg-accent/10">
        <CardContent className="p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="flex-1 space-y-1">
            <div className="font-medium">Ainda não tem conta no Passhub?</div>
            <p className="text-sm text-muted-foreground">
              Crie pelo link de indicação. Depois, em Passhub → Configurações → API, gere uma chave para cada módulo
              contratado (aéreo, hospedagem, seguro, rodoviário).
            </p>
          </div>
          <Button asChild>
            <a href={PASSHUB_REFERRAL_URL} target="_blank" rel="noopener noreferrer">
              Criar conta <ExternalLink className="h-4 w-4 ml-1" />
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
        <CardContent className="p-5">
          <Row
            label="Usar o Passhub nesta agência"
            hint={`${keysSaved} de 4 chaves salvas`}
            checked={form.enabled}
            onChange={(v) => set("enabled", v)}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {PASSHUB_PRODUCTS.map((p) => {
          const Icon = ICONS[p];
          const view = data.products[p];
          const f = form.products[p];
          return (
            <Card key={p} className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="flex-1">{PASSHUB_PRODUCT_LABEL[p]}</span>
                  <Switch
                    checked={f.enabled}
                    onCheckedChange={(v) => setProduct(p, { enabled: v })}
                    disabled={disabled}
                    aria-label={`Ativar ${PASSHUB_PRODUCT_LABEL[p]}`}
                  />
                </CardTitle>
                <div>
                  {f.clearKey ? (
                    <Badge variant="destructive">Chave será removida ao salvar</Badge>
                  ) : view.hasKey ? (
                    <Badge variant="secondary">Chave salva {view.keyHint}</Badge>
                  ) : (
                    <Badge variant="outline">Sem chave</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor={`key-${p}`} className="text-xs text-muted-foreground">
                  Chave de API — {PASSHUB_PRODUCT_LABEL[p]}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`key-${p}`}
                    type="password"
                    autoComplete="off"
                    placeholder={view.hasKey ? "Em branco mantém a atual" : "Cole a chave aqui"}
                    value={f.apiKey}
                    onChange={(e) => setProduct(p, { apiKey: e.target.value, clearKey: false })}
                    disabled={disabled}
                  />
                  {view.hasKey && !f.clearKey && (
                    <Button variant="outline" size="sm" className="h-9" disabled={disabled} onClick={() => setProduct(p, { apiKey: "", clearKey: true })}>
                      Remover
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Contatos da agência nas reservas</CardTitle>
          <CardDescription>
            Nas emissões vai sempre o e-mail e o telefone da agência — nunca os do cliente. Assim a agência recebe os
            avisos de alteração ou cancelamento da companhia e avisa o cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-email" className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail da agência</Label>
            <Input id="ag-email" type="email" placeholder="reservas@suaagencia.com.br" value={form.agencyContactEmail} onChange={(e) => set("agencyContactEmail", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-phone" className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefone da agência</Label>
            <Input id="ag-phone" placeholder="(67) 99999-9999" value={form.agencyContactPhone} onChange={(e) => set("agencyContactPhone", e.target.value)} disabled={disabled} />
          </div>
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
                <Button key={m} size="sm" variant={form.quoteValidityMinutes === m ? "default" : "outline"} onClick={() => set("quoteValidityMinutes", m)} disabled={disabled}>
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
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">Depois de colocar a chave, como funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
            <li>O cliente pede uma viagem e o Guatá coleta o briefing (origem, destino, datas, passageiros, hospedagem).</li>
            <li>Com o produto ligado e com chave, a cotação daquele produto usa o Passhub. Sem chave, o consultor cota.</li>
            <li>A cotação sai no padrão da agência: 3 opções, prazo de pagamento e aviso de que os valores podem mudar.</li>
            <li>Cliente escolheu: o Guatá pede Nome completo (igual ao documento), CPF e Data de nascimento.</li>
            <li>Pagamento por link — enviado pelo consultor (ou pelo Guatá, se você liberar acima).</li>
            <li>Emissão com os contatos da agência; o consultor envia o voucher pela conversa.</li>
          </ol>
          <p className="text-xs text-muted-foreground mt-3">
            A busca automática de tarifas entra em funcionamento quando o Passhub liberar o acesso de integração da sua
            conta. Até lá as chaves ficam guardadas com segurança e o consultor monta a cotação na conversa.
          </p>
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
