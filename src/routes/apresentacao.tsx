import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/guata/brand-logo";
import { Bot, ClipboardList, FileText, MessageSquare, Sparkles, Zap } from "lucide-react";

export const Route = createFileRoute("/apresentacao")({
  head: () => ({
    meta: [
      { title: "Guatá Channel — IA no WhatsApp para agências de turismo" },
      { name: "description", content: "Atendimento automático no WhatsApp com IA, triagem de clientes e resumo pronto para fechar vendas. Solicite seu acesso." },
      { property: "og:title", content: "Guatá Channel — IA no WhatsApp para agências" },
      { property: "og:description", content: "A IA atende, organiza e entrega o cliente pronto para você fechar a venda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Apresentacao,
});

const schema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome").max(120),
  empresa: z.string().trim().min(2, "Informe a empresa").max(160),
  email: z.string().trim().email("E-mail inválido").max(255),
  whatsapp: z.string().trim().min(8, "WhatsApp inválido").max(30),
  cidade: z.string().trim().max(120).optional(),
  mensagem: z.string().trim().max(1000).optional(),
});

const features = [
  { icon: Bot, t: "IA atende 24h", d: "Responde clientes no seu WhatsApp com linguagem natural, no tom da sua empresa." },
  { icon: ClipboardList, t: "Triagem automática", d: "Coleta destino, datas, pessoas e orçamento sem você digitar nada." },
  { icon: Sparkles, t: "Resumo para fechar", d: "Você recebe o cliente resumido e uma mensagem pronta para fechar a venda." },
  { icon: FileText, t: "Sua base de conhecimento", d: "Envie PDFs, planilhas e textos com seus pacotes e preços." },
  { icon: MessageSquare, t: "Assuma quando quiser", d: "Um clique e você continua a conversa pessoalmente." },
  { icon: Zap, t: "Avisos na hora", d: "Alertas quando um cliente quer falar com uma pessoa." },
];

function Apresentacao() {
  const [form, setForm] = useState({ nome: "", empresa: "", email: "", whatsapp: "", cidade: "", mensagem: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSending(true);
    const { error } = await supabase.from("access_requests").insert({
      ...parsed.data,
      cidade: parsed.data.cidade || null,
      mensagem: parsed.data.mensagem || null,
    });
    setSending(false);
    if (error) return toast.error("Não foi possível enviar. Tente novamente.");
    setSent(true);
    toast.success("Solicitação enviada! Entraremos em contato.");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10 text-xl" />
          <span className="font-display text-xl font-semibold text-primary">Guatá Channel</span>
        </div>
        <Button variant="outline" asChild>
          <Link to="/login">Entrar</Link>
        </Button>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-primary leading-tight">
            A IA atende seus clientes no WhatsApp. Você só fecha a venda.
          </h1>
          <p className="text-lg text-muted-foreground">
            O Guatá Channel conversa com quem chama sua empresa, tira dúvidas, organiza o pedido e entrega
            tudo resumido para você entrar só na hora certa.
          </p>
          <Button size="lg" asChild>
            <a href="#solicitar">Solicitar acesso</a>
          </Button>
        </div>
        <Card className="rounded-2xl border-accent/50">
          <CardContent className="p-6 space-y-3 text-sm">
            <div className="rounded-xl bg-muted p-3 w-fit max-w-[80%]">Oi! Queria ir pra Bonito em novembro, somos 3.</div>
            <div className="rounded-xl bg-primary text-primary-foreground p-3 w-fit max-w-[80%] ml-auto">
              Que ótimo! Quais datas vocês pensam e há crianças no grupo?
            </div>
            <div className="rounded-xl border border-accent bg-accent/15 p-3">
              <p className="font-semibold text-primary">Cliente pronto para fechar</p>
              <p className="text-muted-foreground">Bonito · 12–16/11 · 2 adultos + 1 criança · orçamento médio</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <Card key={f.t} className="rounded-2xl">
            <CardContent className="p-6 space-y-2">
              <f.icon className="h-6 w-6 text-accent" />
              <h3 className="font-semibold text-primary">{f.t}</h3>
              <p className="text-sm text-muted-foreground">{f.d}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section id="solicitar" className="max-w-2xl mx-auto px-6 py-16">
        <Card className="rounded-2xl">
          <CardContent className="p-8">
            <h2 className="font-display text-3xl font-semibold text-primary mb-2">Solicitar acesso</h2>
            <p className="text-muted-foreground mb-6">Preencha e entraremos em contato para ativar sua conta.</p>
            {sent ? (
              <p className="text-primary font-medium">Recebemos sua solicitação. Em breve falaremos com você pelo WhatsApp.</p>
            ) : (
              <form onSubmit={submit} className="grid gap-3">
                <Input placeholder="Seu nome" value={form.nome} onChange={set("nome")} />
                <Input placeholder="Empresa / agência" value={form.empresa} onChange={set("empresa")} />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input type="email" placeholder="E-mail" value={form.email} onChange={set("email")} />
                  <Input placeholder="WhatsApp com DDD" value={form.whatsapp} onChange={set("whatsapp")} />
                </div>
                <Input placeholder="Cidade (opcional)" value={form.cidade} onChange={set("cidade")} />
                <Textarea placeholder="Conte um pouco sobre seu atendimento (opcional)" value={form.mensagem} onChange={set("mensagem")} />
                <Button type="submit" size="lg" disabled={sending}>
                  {sending ? "Enviando..." : "Enviar solicitação"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
      <footer className="text-center text-sm text-muted-foreground py-8">© Guatá Channel</footer>
    </div>
  );
}
