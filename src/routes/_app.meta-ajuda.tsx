import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, ExternalLink, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMetaAjudaStatus, setBotPausedFn } from "@/lib/bot-pause.functions";

export const Route = createFileRoute("/_app/meta-ajuda")({
  component: MetaAjudaPage,
});

const HELP_ITEMS: Array<{
  id: string;
  title: string;
  tag: "Meta" | "Painel";
  body: ReactNode;
}> = [
  {
    id: "app-vs-api",
    title: "1. App no celular vs plataforma (Guatá)",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Mensagem digitada no <strong className="text-foreground">WhatsApp Business do celular</strong>{" "}
          não entra na cobrança da Cloud API nem nas 1.000 mensagens service.
        </p>
        <p>
          Resposta pelo <strong className="text-foreground">Guatá / painel / bot</strong> usa a API e
          conta (service ou template, conforme o tipo).
        </p>
      </div>
    ),
  },
  {
    id: "mil",
    title: "2. As 1.000 mensagens service por mês",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Por número comercial, a Meta libera cerca de{" "}
          <strong className="text-foreground">1.000 mensagens service</strong> grátis por mês
          (respostas livres na janela de 24h via API). A partir da 1.001ª, cobra.
        </p>
        <p>
          O contador nesta página é uma <strong className="text-foreground">estimativa do Guatá</strong>{" "}
          (mensagens enviadas pelo bot/painel). A fatura oficial está no Meta Business Suite.
        </p>
      </div>
    ),
  },
  {
    id: "templates",
    title: "3. Templates (modelos aprovados)",
    tag: "Meta",
    body: (
      <p className="text-muted-foreground">
        Disparo com modelo aprovado (marketing, utility, auth) cobra na entrega — é outro tipo de
        cobrança, separado das 1.000 service. Use em Conhecimento → Disparos com cuidado.
      </p>
    ),
  },
  {
    id: "coexist",
    title: "4. Coexistência: celular e painel juntos",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>Cliente manda mensagem → aparece no celular e no painel ao mesmo tempo.</p>
        <p>
          Se você responde no app, o Guatá coloca aquela conversa em{" "}
          <strong className="text-foreground">humano</strong> e para de responder junto.
        </p>
        <p>Se o bot estiver ligado e você não assumir, a resposta pela API conta nas 1.000.</p>
      </div>
    ),
  },
  {
    id: "pausar",
    title: "5. Pausar Guatá (só humano)",
    tag: "Painel",
    body: (
      <p className="text-muted-foreground">
        O interruptor no topo desta página pausa o bot em toda a organização: novas mensagens não
        disparam a IA e as conversas em bot passam para humano. Ideal quando a equipe atende só pelo
        celular para não gastar a cota da Meta.
      </p>
    ),
  },
  {
    id: "conversas",
    title: "6. Conversas, Leads e Não contatar",
    tag: "Painel",
    body: (
      <p className="text-muted-foreground">
        Em Conversas: Ativas (em atendimento), Leads (qualificando/quente) e Não contatar (opt-out).
        Use Liberar contato se a pessoa voltar a querer receber mensagens.
      </p>
    ),
  },
  {
    id: "disparos",
    title: "7. Disparos e modelos",
    tag: "Painel",
    body: (
      <p className="text-muted-foreground">
        Em Conhecimento → Disparos você sincroniza templates da WABA e envia campanhas. Confira o
        histórico por telefone antes de reenviar.
      </p>
    ),
  },
  {
    id: "links",
    title: "8. Links oficiais da Meta",
    tag: "Meta",
    body: (
      <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
        <li>
          <a
            className="text-foreground underline inline-flex items-center gap-1"
            href="https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing"
            target="_blank"
            rel="noreferrer"
          >
            Pricing WhatsApp <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </li>
        <li>
          <a
            className="text-foreground underline inline-flex items-center gap-1"
            href="https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users"
            target="_blank"
            rel="noreferrer"
          >
            Coexistência / app + API <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </li>
      </ul>
    ),
  },
];

function MetaAjudaPage() {
  const qc = useQueryClient();
  const statusFn = useServerFn(fetchMetaAjudaStatus);
  const pauseFn = useServerFn(setBotPausedFn);

  const { data, isLoading } = useQuery({
    queryKey: ["meta-ajuda-status"],
    queryFn: () => statusFn(),
    refetchInterval: 60_000,
  });

  const pauseMut = useMutation({
    mutationFn: (paused: boolean) => pauseFn({ data: { paused } }),
    onSuccess: (r) => {
      qc.setQueryData(["meta-ajuda-status"], (old: typeof data) =>
        old
          ? { ...old, botPaused: r.botPaused, botPausedAt: r.botPausedAt }
          : old,
      );
      toast.success(r.botPaused ? "Guatá pausado — só humano" : "Guatá reativado");
      qc.invalidateQueries({ queryKey: ["meta-ajuda-status"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível alterar a pausa"),
  });

  const count = data?.serviceCount ?? 0;
  const free = data?.freeTier ?? 1000;
  const paused = Boolean(data?.botPaused);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
          Meta / Ajuda
        </h1>
        <p className="text-muted-foreground">
          Cobrança WhatsApp, pausa do bot e guia rápido do painel
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {paused ? (
              <PauseCircle className="h-8 w-8 text-amber-600" />
            ) : (
              <PlayCircle className="h-8 w-8 text-emerald-600" />
            )}
            <div>
              <Label htmlFor="pause-guata" className="text-base font-medium">
                Pausar Guatá (só humano)
              </Label>
              <p className="text-xs text-muted-foreground">
                Com pausa ligada, a IA não responde em nenhuma conversa.
              </p>
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-6 w-12" />
          ) : (
            <Switch
              id="pause-guata"
              checked={paused}
              disabled={pauseMut.isPending}
              onCheckedChange={(v) => pauseMut.mutate(v)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="text-sm text-muted-foreground">Service estimado este mês:</span>
          {isLoading ? (
            <Skeleton className="h-6 w-24" />
          ) : (
            <Badge variant={count >= free ? "destructive" : count >= free * 0.8 ? "secondary" : "outline"}>
              {count} / {free}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            (proxy do Guatá — confira a fatura na Meta)
          </span>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-2 shadow-sm md:p-4">
        <div className="mb-2 flex items-center gap-2 px-2 pt-2">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Guia — Meta e painel</h2>
        </div>
        <Accordion type="multiple" className="px-2">
          {HELP_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="gap-2 hover:no-underline">
                <span className="flex flex-1 flex-wrap items-center gap-2 text-left">
                  <span>{item.title}</span>
                  <Badge variant="secondary" className="font-normal">
                    {item.tag}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>{item.body}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
