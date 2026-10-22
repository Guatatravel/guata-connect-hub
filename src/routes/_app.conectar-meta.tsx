import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  fetchOrganizationContext,
  saveWhatsAppChannel,
} from "@/lib/organizations.functions";
import { useState } from "react";

export const Route = createFileRoute("/_app/conectar-meta")({
  head: () => ({
    meta: [
      { title: "Conectar WhatsApp (Meta) — Guatá Channel" },
      { name: "description", content: "Configure os canais WhatsApp da sua organização." },
    ],
  }),
  component: ConectarMeta,
});

const steps = [
  ["Webhook", "Em WhatsApp > Configuração, cole a URL do webhook (em Configurações) e assine o campo messages."],
  ["Token permanente", "Gere um token com whatsapp_business_messaging e whatsapp_business_management."],
  ["Salvar aqui", "Preencha WABA ID, Phone Number ID e Access Token por linha. Se vazio, o servidor usa as variáveis de ambiente (Lovable Secrets)."],
];

function ChannelForm({
  line,
  label,
  initial,
}: {
  line: "descubra" | "viagens";
  label: string;
  initial: {
    waba_id: string | null;
    phone_number_id: string | null;
    has_token: boolean;
  };
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveWhatsAppChannel);
  const [wabaId, setWabaId] = useState(initial.waba_id ?? "");
  const [phoneId, setPhoneId] = useState(initial.phone_number_id ?? "");
  const [token, setToken] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          line,
          label,
          wabaId,
          phoneNumberId: phoneId,
          accessToken: token || undefined,
        },
      }),
    onSuccess: () => {
      toast.success(`Canal ${label} salvo`);
      setToken("");
      qc.invalidateQueries({ queryKey: ["org-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">{label}</CardTitle>
        <Badge variant="outline">{initial.has_token ? "Token no painel" : "Usando env / pendente"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <Label>WhatsApp Business Account ID</Label>
          <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="WABA ID" />
        </div>
        <div className="space-y-1">
          <Label>Phone Number ID</Label>
          <Input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="ID do número na Meta" />
        </div>
        <div className="space-y-1">
          <Label>Access Token {initial.has_token ? "(deixe vazio para manter)" : ""}</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token permanente"
            autoComplete="off"
          />
        </div>
        <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
          Salvar canal
        </Button>
      </CardContent>
    </Card>
  );
}

function ConectarMeta() {
  const fetchOrg = useServerFn(fetchOrganizationContext);
  const { data, isLoading } = useQuery({
    queryKey: ["org-context"],
    queryFn: () => fetchOrg(),
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">Conectar WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Organização:{" "}
          {isLoading ? "…" : data?.organization.name ?? "—"}
          {data?.organization.isGuata && (
            <span className="ml-2 text-primary">(Guatá — base Descubra MS ativa)</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Novas agências parceiras usarão só fontes locais; Descubra MS é exclusivo da org Guatá.
        </p>
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        data.channels
          .filter((ch) => data.organization.isGuata || ch.line === "descubra")
          .map((ch) => (
          <ChannelForm
            key={ch.id}
            line={ch.line}
            label={ch.label || (ch.line === "descubra" ? (data.organization.isGuata ? "Descubra MS" : "WhatsApp") : "Guatá Viagens")}
            initial={{
              waba_id: ch.waba_id,
              phone_number_id: ch.phone_number_id,
              has_token: ch.has_token,
            }}
          />
        ))
      )}

      {steps.map(([t, d]) => (
        <Card key={t} className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {d}{" "}
            {t === "Webhook" && (
              <Link to="/configuracoes" className="text-primary underline">
                Abrir Configurações
              </Link>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
