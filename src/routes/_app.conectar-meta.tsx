import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  fetchOrganizationContext,
  saveWhatsAppChannel,
} from "@/lib/organizations.functions";
import {
  completeWhatsAppEmbeddedSignup,
  fetchWhatsAppEmbeddedState,
  resubscribeWhatsAppCoexistenceForOrg,
} from "@/lib/whatsapp-embedded.functions";
import { disconnectWhatsApp } from "@/lib/account.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  loadFacebookSdk,
  loginWithEmbeddedSignup,
  rememberEmbeddedSignupMessage,
  waitForEmbeddedSession,
} from "@/lib/whatsapp-embedded.browser";
import { embeddedSignupToast, type EmbeddedSignupSession } from "@/lib/whatsapp-embedded.shared";
import { META_WHATSAPP_SETUP } from "@/lib/meta-setup-guide";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_app/conectar-meta")({
  head: () => ({
    meta: [
      { title: "Conectar WhatsApp (Meta) — Guatá Channel" },
      { name: "description", content: "Configure os canais WhatsApp da sua organização." },
    ],
  }),
  component: ConectarMeta,
});

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10.1 10.1 0 0 0 4.65 1.12h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 14.15c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.42-.14-.95-.31-1.64-.6-2.88-1.24-4.76-4.14-4.9-4.33-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.37.24-.26.64-.38.96-.38.12 0 .22 0 .32.01.28.01.42-.04.66.5.24.56.82 1.94.89 2.08.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.37-.42.49-.14.14-.28.28-.12.55.16.26.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.26.14.42.12.58-.07.16-.19.66-.77.84-1.03.17-.26.35-.22.58-.13.24.09 1.5.71 1.76.84.26.12.43.19.5.29.06.1.06.6-.18 1.28z" />
    </svg>
  );
}

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
      qc.invalidateQueries({ queryKey: ["whatsapp-embedded"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-foreground">{label}</p>
        <Badge variant="outline">{initial.has_token ? "Token salvo" : "Usando configuração do servidor"}</Badge>
      </div>
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
      <p className="text-xs text-muted-foreground">
        Ao salvar, o Guatá passa a receber e responder as mensagens por este número.
      </p>
      <Button disabled={mut.isPending} onClick={() => mut.mutate()}>
        Salvar canal
      </Button>
    </div>
  );
}

function ConectarMeta() {
  const qc = useQueryClient();
  const fetchOrg = useServerFn(fetchOrganizationContext);
  const fetchEmbedded = useServerFn(fetchWhatsAppEmbeddedState);
  const completeSignup = useServerFn(completeWhatsAppEmbeddedSignup);
  const disconnectFn = useServerFn(disconnectWhatsApp);
  const resubscribeFn = useServerFn(resubscribeWhatsAppCoexistenceForOrg);
  const sessionRef = useRef<EmbeddedSignupSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["org-context"],
    queryFn: () => fetchOrg(),
  });
  const embedded = useQuery({
    queryKey: ["whatsapp-embedded"],
    queryFn: () => fetchEmbedded(),
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const session = rememberEmbeddedSignupMessage(event.origin, event.data);
      if (session) sessionRef.current = session;
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const appId = embedded.data?.appId;
    if (!embedded.data?.ready || !appId) return;
    let cancelled = false;
    loadFacebookSdk(appId)
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Não foi possível carregar o Facebook.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [embedded.data?.appId, embedded.data?.ready]);

  const connect = async () => {
    const state = embedded.data;
    if (!state?.ready || !state.appId) {
      toast.error("A conexão oficial aguarda a configuração do aplicativo Meta.");
      return;
    }
    if (!sdkReady) {
      toast.error("O Facebook ainda está carregando. Aguarde um instante e tente de novo.");
      return;
    }
    setConnecting(true);
    sessionRef.current = null;
    try {
      const response = await loginWithEmbeddedSignup(state.configId);
      const code = response.authResponse?.code;
      if (!code) {
        const session = await waitForEmbeddedSession(() => sessionRef.current);
        const message = embeddedSignupToast(session, true);
        if (session?.event === "CANCEL") toast.info(message ?? "Conexão cancelada na janela da Meta.");
        else toast.error(message ?? "A janela da Meta foi fechada antes de concluir a conexão.");
        return;
      }
      const session = await waitForEmbeddedSession(() => sessionRef.current);
      const result = await completeSignup({
        data: {
          code,
          ...(session?.wabaId ? { wabaId: session.wabaId } : {}),
          ...(session?.phoneNumberId ? { phoneNumberId: session.phoneNumberId } : {}),
        },
      });
      await qc.invalidateQueries({ queryKey: ["org-context"] });
      await qc.invalidateQueries({ queryKey: ["whatsapp-embedded"] });
      toast.success(
        result.displayPhone ? `WhatsApp ${result.displayPhone} conectado` : "WhatsApp oficial conectado",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnectMut = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: (r) => {
      toast.success(
        r.channels > 0
          ? "WhatsApp desvinculado do Guatá. Abra a Meta para conectar de novo."
          : "Não havia vínculo salvo nesta agência.",
      );
      void qc.invalidateQueries({ queryKey: ["org-context"] });
      void qc.invalidateQueries({ queryKey: ["whatsapp-embedded"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível desvincular"),
  });

  const resubscribeMut = useMutation({
    mutationFn: () => resubscribeFn(),
    onSuccess: (r) => {
      toast.success(
        r?.callbackUrl
          ? `Webhook da Meta apontado para ${r.callbackUrl}. Mande um teste só pelo celular.`
          : "Webhooks reinscritos. Mande um teste só pelo celular.",
      );
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível reinscrever o webhook."),
  });

  const connection = embedded.data?.connection;
  const canManage = embedded.data?.canManage ?? data?.canManageWhatsApp;
  const official = data?.channels.filter((ch) => ch.line === "descubra").slice(0, 1) ?? [];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">Conectar WhatsApp</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "…" : data?.organization.name ?? "—"}
          {data?.organization.isGuata ? " · Descubra MS" : ""}
        </p>
      </div>

      <Card className="rounded-2xl border-primary/30">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">WhatsApp com coexistência</CardTitle>
              <CardDescription>
                Celular e painel no mesmo número. As conversas do Guatá ficam aqui; etiquetas e catálogo continuam no app.
              </CardDescription>
            </div>
            {connection?.connected && <Badge>Conectado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {connection?.connected && canManage !== false && (
            <p className="text-foreground font-medium">
              {connection.displayPhone
                ? connection.displayPhone
                : "Número salvo nesta organização"}
              {connection.verifiedName ? ` · ${connection.verifiedName}` : ""}
            </p>
          )}
          {connection?.connected && canManage === false && (
            <p className="text-foreground">Linha conectada nesta agência.</p>
          )}
          {canManage === false ? (
            <p className="text-xs text-muted-foreground">
              Somente o dono ou administrador da agência pode conectar ou desvincular.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="rounded-xl"
                disabled={connecting || embedded.isLoading || (Boolean(embedded.data?.ready) && !sdkReady)}
                onClick={() => void connect()}
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <WhatsAppIcon />
                )}
                {connection?.connected ? "Reautorizar via Meta" : "Conectar via Meta"}
              </Button>
              {connection?.connected && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={resubscribeMut.isPending}
                    onClick={() => resubscribeMut.mutate()}
                  >
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${resubscribeMut.isPending ? "animate-spin" : ""}`}
                    />
                    Reinscrever eco
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        disabled={disconnectMut.isPending}
                      >
                        <Unplug className="h-4 w-4 mr-2" />
                        Desvincular
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desvincular o WhatsApp do Guatá?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O painel deixa de enviar e receber pela Meta até você conectar de novo. O número continua
                          no celular e no Gerenciador de Negócios. As conversas já gravadas permanecem aqui.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => disconnectMut.mutate()}>Desvincular</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Eco do celular:{" "}
            <Link to="/diagnostico-whatsapp" className="text-primary underline">
              Diagnóstico WhatsApp
            </Link>
            . Modelos de mensagem são cobrados pela Meta no cartão do seu Business Manager.
          </p>
          {embedded.isError && (
            <p className="text-xs text-destructive">
              {embedded.error instanceof Error ? embedded.error.message : "Não foi possível carregar a conexão."}
            </p>
          )}
          {canManage && !embedded.isLoading && embedded.data && !embedded.data.ready && (
            <p className="text-xs text-muted-foreground">
              A conexão oficial aguarda a configuração do aplicativo Meta no servidor.
            </p>
          )}
          {embedded.data?.ready && !sdkReady && !connecting && (
            <p className="text-xs text-muted-foreground">Carregando o Facebook para abrir a janela da Meta.</p>
          )}
        </CardContent>
      </Card>

      {canManage !== false && (
      <Accordion type="single" collapsible className="rounded-2xl border bg-card px-6">
        <AccordionItem value="manual" className="border-b-0">
          <AccordionTrigger>Configuração Manual Avançada</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use estes campos só se o cadastro pela Meta não estiver disponível. O token continua gravado apenas no servidor.
            </p>
            {isLoading || !data ? (
              <Skeleton className="h-48 rounded-2xl" />
            ) : (
              official.map((ch) => (
                <ChannelForm
                  key={ch.id}
                  line={ch.line}
                  label="Guatá — WhatsApp Oficial"
                  initial={{
                    waba_id: ch.waba_id,
                    phone_number_id: ch.phone_number_id,
                    has_token: ch.has_token,
                  }}
                />
              ))
            )}
            {META_WHATSAPP_SETUP.map((step) => (
              <div key={step.title} className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{step.title}</p>
                <p>{step.body}</p>
                {step.links.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {step.links.map((l) => (
                      <li key={l.href}>
                        {"internal" in l && l.internal ? (
                          <Link to={l.href} className="text-primary underline">
                            {l.label}
                          </Link>
                        ) : (
                          <a href={l.href} target="_blank" rel="noreferrer" className="text-primary underline">
                            {l.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      )}
    </div>
  );
}
