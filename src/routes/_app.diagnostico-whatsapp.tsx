import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Copy,
} from "lucide-react";
import {
  getWhatsAppDiagnostics,
  sendWhatsAppTestMessage,
} from "@/lib/whatsapp-diagnostics.functions";

const STABLE_PUBLIC_URL =
  "https://project--16a8412a-83f5-4d18-bc70-414943f20be8.lovable.app";

export const Route = createFileRoute("/_app/diagnostico-whatsapp")({
  component: DiagnosticoWhatsApp,
  head: () => ({
    meta: [
      { title: "Diagnóstico do WhatsApp | Guatá Channel" },
      {
        name: "description",
        content:
          "Verifique se o WhatsApp do Guatá está recebendo e respondendo mensagens.",
      },
    ],
  }),
});

function fmt(iso: string | null | undefined) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR");
}

function Row({
  state,
  label,
  detail,
  hint,
}: {
  state: "ok" | "warn" | "fail";
  label: string;
  detail: string;
  hint?: string;
}) {
  const Icon =
    state === "ok" ? CheckCircle2 : state === "warn" ? AlertTriangle : XCircle;
  const color =
    state === "ok"
      ? "text-primary"
      : state === "warn"
        ? "text-accent"
        : "text-destructive";
  return (
    <div className="flex gap-3 items-start py-3 border-b last:border-0">
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${color}`} />
      <div className="space-y-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {hint && <p className="text-xs text-muted-foreground italic">{hint}</p>}
      </div>
    </div>
  );
}

function DiagnosticoWhatsApp() {
  const run = useServerFn(getWhatsAppDiagnostics);
  const sendTest = useServerFn(sendWhatsAppTestMessage);
  const [to, setTo] = useState("");

  const q = useQuery({
    queryKey: ["whatsapp-diagnostics"],
    queryFn: () => run(),
    refetchInterval: 20_000,
  });

  const test = useMutation({
    mutationFn: () => sendTest({ data: { to } }),
    onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Falha ao enviar"),
  });

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Copiado");
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  const d = q.data;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-primary">
            Diagnóstico do WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Mostra se a Meta está entregando mensagens para o Guatá e se ele
            consegue responder.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => q.refetch()}
          disabled={q.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`}
          />
          Atualizar
        </Button>
      </div>

      {q.isLoading || !d ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Situação atual</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Row
                state={d.entregas.total === 0 ? "fail" : "ok"}
                label="A Meta já entregou alguma mensagem?"
                detail={
                  d.entregas.total === 0
                    ? "Nenhuma entrega recebida até agora."
                    : `${d.entregas.total} entrega(s). Última: ${fmt(d.entregas.ultima)}.`
                }
                hint={
                  d.entregas.total === 0
                    ? "No painel da Meta, confirme a URL de retorno e marque a assinatura do campo “messages”. Depois mande uma mensagem do celular e atualize esta tela."
                    : undefined
                }
              />
              <Row
                state={
                  d.entregas.total === 0
                    ? "warn"
                    : d.entregas.totalAssinaturaOk === 0
                      ? "fail"
                      : "ok"
                }
                label="As entregas estão assinadas corretamente?"
                detail={
                  d.entregas.total === 0
                    ? "Sem entregas para conferir."
                    : `${d.entregas.totalAssinaturaOk} de ${d.entregas.total} entrega(s) com assinatura válida.`
                }
                hint={
                  d.entregas.total > 0 && d.entregas.totalAssinaturaOk === 0
                    ? "O segredo do app cadastrado aqui é diferente do app que está enviando. Copie novamente o App Secret na Meta e atualize a chave META_APP_SECRET."
                    : undefined
                }
              />
              <Row
                state={
                  !d.token.ok ? "fail" : d.token.permanente ? "ok" : "warn"
                }
                label="Token de acesso da Meta"
                detail={
                  !d.token.ok
                    ? (d.token.error ?? "Token inválido.")
                    : d.token.permanente
                      ? "Válido e permanente."
                      : `Válido, mas expira em ${fmt(d.token.expiraEm)}.`
                }
                hint={
                  d.token.ok && !d.token.permanente
                    ? "Gere um token permanente (usuário do sistema) para o bot não parar de responder."
                    : undefined
                }
              />
              <Row
                state={d.numero.ok ? "ok" : "fail"}
                label="Número conectado"
                detail={
                  d.numero.ok
                    ? `${d.numero.displayPhone ?? "—"} — ${d.numero.verifiedName ?? "sem nome"} (qualidade: ${d.numero.quality ?? "—"})`
                    : (d.numero.error ?? "Não foi possível consultar.")
                }
              />
              <Row
                state={
                  d.secrets.accessToken &&
                  d.secrets.phoneNumberId &&
                  d.secrets.appSecret &&
                  d.secrets.verifyToken
                    ? "ok"
                    : "fail"
                }
                label="Chaves cadastradas"
                detail={[
                  `token de acesso: ${d.secrets.accessToken ? "ok" : "faltando"}`,
                  `número: ${d.secrets.phoneNumberId ? "ok" : "faltando"}`,
                  `segredo do app: ${d.secrets.appSecret ? "ok" : "faltando"}`,
                  `token de verificação: ${d.secrets.verifyToken ? "ok" : "faltando"}`,
                ].join(" • ")}
                hint={
                  d.secrets.viagensConfigurada
                    ? "Linha Guatá Viagens configurada."
                    : "Linha Guatá Viagens ainda não configurada — tudo entra como Descubra MS."
                }
              />
              <Row
                state={d.conversas.mensagens > 0 ? "ok" : "warn"}
                label="Movimento no painel"
                detail={`${d.conversas.sessions} conversa(s), ${d.conversas.mensagens} mensagem(ns), ${d.conversas.triagens} triagem(ns).`}
              />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Enviar mensagem de teste</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="to">Número com DDI e DDD</Label>
              <div className="flex gap-2">
                <Input
                  id="to"
                  placeholder="5567999999999"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
                <Button
                  onClick={() => test.mutate()}
                  disabled={test.isPending || to.trim().length < 10}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Enviar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Fora da janela de 24h desde a última mensagem do cliente, a Meta
                só aceita modelos aprovados — o erro aparecerá aqui do jeito que
                ela devolveu.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Últimas entregas recebidas</CardTitle>
            </CardHeader>
            <CardContent>
              {d.ultimasEntregas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nada recebido ainda. Mande uma mensagem do celular para o
                  número conectado e atualize esta tela.
                </p>
              ) : (
                <ul className="space-y-3">
                  {d.ultimasEntregas.map((e) => (
                    <li
                      key={e.id}
                      className="text-sm border-b last:border-0 pb-3 last:pb-0"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={e.signature_ok ? "default" : "destructive"}
                        >
                          {e.signature_ok
                            ? "assinatura ok"
                            : "assinatura recusada"}
                        </Badge>
                        <Badge variant="secondary">{e.event_kind}</Badge>
                        <span className="text-muted-foreground">
                          {fmt(e.created_at)}
                        </span>
                      </div>
                      <p className="mt-1">{e.preview}</p>
                      {e.error && (
                        <p className="text-xs text-destructive">{e.error}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle>Conferência na Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-2 items-center">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                  {`${STABLE_PUBLIC_URL}/api/public/webhooks/whatsapp`}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(`${STABLE_PUBLIC_URL}/api/public/webhooks/whatsapp`)
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                <li>
                  No app da Meta, produto WhatsApp → Configuração: a URL de
                  retorno deve ser exatamente a de cima.
                </li>
                <li>
                  O token de verificação precisa ser o mesmo salvo aqui
                  (META_VERIFY_TOKEN).
                </li>
                <li>
                  Em “Campos do webhook”, a linha <strong>messages</strong>{" "}
                  precisa estar inscrita.
                </li>
                <li>
                  O segredo do app (App Secret) precisa ser do mesmo app que
                  envia as entregas.
                </li>
                <li>
                  Enquanto o número estiver em teste, só números cadastrados
                  como testadores recebem resposta.
                </li>
              </ol>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
