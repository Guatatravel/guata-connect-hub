import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, ExternalLink } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMetaAjudaStatus } from "@/lib/bot-pause.functions";

export const Route = createFileRoute("/_app/meta-ajuda")({
  component: MetaAjudaPage,
});

const META_PRICING =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing";
const META_COEXIST =
  "https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users";

function MetaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="text-foreground underline inline-flex items-center gap-1"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

const HELP_ITEMS: Array<{
  id: string;
  title: string;
  tag: "Meta" | "Plataforma" | "Painel";
  body: ReactNode;
}> = [
  {
    id: "mensalidade",
    title: "1. Mensalidade da plataforma (painel + BOT)",
    tag: "Plataforma",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          É o que a agência paga pelo <strong className="text-foreground">painel</strong> (Conversas,
          Conhecimento, Disparos) e pelo <strong className="text-foreground">BOT</strong> automático.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> sua mensalidade do sistema cobre o
          software. Isso <em>não</em> inclui a fatura da Meta pelo WhatsApp.
        </p>
      </div>
    ),
  },
  {
    id: "meta-cobranca",
    title: "2. Cobrança da Meta (WhatsApp)",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          A Meta cobra mensagens enviadas pela <strong className="text-foreground">API</strong>{" "}
          (BOT ou alguém digitando no painel), por categoria e país do cliente.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> o BOT responde “Oi, qual o destino?”
          → isso pode contar como mensagem <em>service</em> na Meta. Digitar no app do celular →{" "}
          <strong className="text-foreground">não</strong> entra nessa cobrança.
        </p>
        <p>
          Consulte: <MetaLink href={META_PRICING}>Pricing oficial da Meta</MetaLink>
        </p>
      </div>
    ),
  },
  {
    id: "app-vs-bot",
    title: "3. Celular (app) vs BOT / painel",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          <strong className="text-foreground">Você no WhatsApp Business do celular:</strong> grátis
          para a Meta (coexistência).
        </p>
        <p>
          <strong className="text-foreground">BOT ou painel:</strong> usa Cloud API → entra nas
          regras de preço da Meta.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> cliente manda “quero pacote”. Você
          responde no app → grátis. Se o BOT responder sozinho → conta na cota da API.
        </p>
        <p>
          <MetaLink href={META_COEXIST}>Coexistência (app + API)</MetaLink>
        </p>
      </div>
    ),
  },
  {
    id: "mil",
    title: "4. As 1.000 mensagens service grátis",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Por número comercial, a Meta libera cerca de{" "}
          <strong className="text-foreground">1.000 mensagens service</strong> por mês (respostas
          livres na janela de 24h via API). Depois da 1.001ª, cobra.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> 800 respostas do BOT no mês → ainda
          no grátis. 1.050 → as últimas 50 podem ser cobradas.
        </p>
        <p>
          O contador em Conversas é uma <strong className="text-foreground">estimativa do painel</strong>.
          A conta certa está no Meta Business Suite.
        </p>
        <p>
          <MetaLink href={META_PRICING}>Ver regra das 1.000 na Meta</MetaLink>
        </p>
      </div>
    ),
  },
  {
    id: "templates",
    title: "5. Templates (disparos com modelo)",
    tag: "Meta",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Modelos aprovados (marketing, utility, auth) cobram na entrega —{" "}
          <strong className="text-foreground">não</strong> usam a cota das 1.000 service.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> campanha “promo fim de semana” para
          200 números → até 200 cobranças de template, separadas do BOT no dia a dia.
        </p>
        <p>
          <MetaLink href={META_PRICING}>Categorias e preços</MetaLink>
        </p>
      </div>
    ),
  },
  {
    id: "apis",
    title: "6. APIs de inteligência (chave da agência)",
    tag: "Plataforma",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Em <strong className="text-foreground">Configurações → Inteligência</strong> a agência
          pode colar chave própria (Gemini ou Lovable). Sem chave própria, usa a conta
          compartilhada da plataforma (com possíveis limites).
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> “Usar chave da minha agência”
          ligado + chave Gemini → o BOT pensa na sua conta Google, não na compartilhada.
        </p>
      </div>
    ),
  },
  {
    id: "voz",
    title: "7. Voz do BOT (ElevenLabs)",
    tag: "Plataforma",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          Em <strong className="text-foreground">Configurações → Voz do BOT</strong> você pode
          colar a chave ElevenLabs da agência e, se quiser, os Voice IDs.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> cliente manda áudio → BOT responde
          em áudio com a voz da sua conta ElevenLabs. Sem chave própria, tenta a do servidor (se
          existir).
        </p>
      </div>
    ),
  },
  {
    id: "pausar",
    title: "8. Pausar o BOT (só humano)",
    tag: "Painel",
    body: (
      <div className="space-y-2 text-muted-foreground">
        <p>
          O interruptor fica em <strong className="text-foreground">Conversas</strong> (topo). Com
          pausa ligada, o BOT não responde; a equipe atende no celular ou no painel.
        </p>
        <p>
          <strong className="text-foreground">Exemplo:</strong> fim de mês perto das 1.000 → pause o
          BOT e atenda pelo app (grátis na Meta).
        </p>
        <p>
          <Link to="/conversas" className="underline text-foreground">
            Ir para Conversas
          </Link>
        </p>
      </div>
    ),
  },
  {
    id: "conversas",
    title: "9. Conversas, Leads e Não contatar",
    tag: "Painel",
    body: (
      <p className="text-muted-foreground">
        Em Conversas: Ativas, Leads (qualificando/quente) e Não contatar (opt-out). Use Liberar
        contato se a pessoa voltar a querer receber mensagens.
      </p>
    ),
  },
  {
    id: "disparos",
    title: "10. Disparos e modelos",
    tag: "Painel",
    body: (
      <p className="text-muted-foreground">
        Em Conhecimento → Disparos: sincronize templates da WABA e envie campanhas. Veja o histórico
        por telefone antes de reenviar (lembre: template = cobrança Meta).
      </p>
    ),
  },
];

function MetaAjudaPage() {
  const statusFn = useServerFn(fetchMetaAjudaStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["meta-ajuda-status"],
    queryFn: () => statusFn(),
    refetchInterval: 60_000,
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
          Mensalidade da plataforma × cobrança da Meta, BOT e guia do painel
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
        <p className="text-sm font-medium text-foreground">Mensagens pela plataforma este mês</p>
        {isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={count >= free ? "destructive" : count >= free * 0.8 ? "secondary" : "outline"}
            >
              {count} de {free} grátis (estimativa)
            </Badge>
            {paused && (
              <Badge variant="secondary">BOT pausado — veja Conversas</Badge>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Contagem aproximada do painel (BOT + respostas no painel). A fatura oficial está no Meta
          Business Suite.{" "}
          <MetaLink href={META_PRICING}>Abrir pricing Meta</MetaLink>
        </p>
        <p className="text-xs text-muted-foreground">
          Para pausar o BOT:{" "}
          <Link to="/conversas" className="underline text-foreground">
            Conversas
          </Link>
          .
        </p>
      </section>

      <section className="rounded-2xl border bg-card p-2 shadow-sm md:p-4">
        <div className="mb-2 flex items-center gap-2 px-2 pt-2">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-medium">Guia completo</h2>
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
