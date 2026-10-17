import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BellRing, MessageSquare, PanelRight } from "lucide-react";

export const Route = createFileRoute("/_app/extensao")({
  head: () => ({
    meta: [
      { title: "Modo Atendimento — Guatá Channel" },
      { name: "description", content: "Acompanhe o Guatá trabalhando e assuma atendimentos." },
    ],
  }),
  component: ExtensaoPage,
});

function ExtensaoPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl font-semibold text-primary">Modo Atendimento</h1>
        <p className="text-muted-foreground">
          Mesmo número WhatsApp da empresa (Meta): a equipe atende aqui — texto, imagem e áudio do
          cliente — sem conta Meta por funcionário. Fixe esta aba ou abra{" "}
          <Link to="/conversas" className="text-primary underline-offset-2 hover:underline">
            Conversas
          </Link>
          .
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: BellRing, t: "Alerta imediato", d: "Quando um cliente pede consultor, você recebe aviso no painel e no seu WhatsApp pessoal." },
          { icon: MessageSquare, t: "IA ao vivo", d: "Veja as respostas do Guatá em tempo real e o dossiê do cliente." },
          { icon: PanelRight, t: "Assumir e devolver", d: "Assuma a conversa com um clique e devolva ao Guatá quando terminar." },
        ].map(({ icon: I, t, d }) => (
          <Card key={t} className="rounded-2xl">
            <CardHeader><I className="h-5 w-5 text-primary" /><CardTitle className="text-base">{t}</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Dica: fixe a aba de Conversas no navegador. Você vê o perfil do cliente, ouve áudios,
            vê fotos enviadas e responde com texto ou imagem — como no WhatsApp, pelo Guatá.
          </p>
          <Button asChild><Link to="/conversas">Abrir conversas</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
