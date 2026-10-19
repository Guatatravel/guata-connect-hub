import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_app/conectar-meta")({
  head: () => ({
    meta: [
      { title: "Conectar WhatsApp (Meta) — Guatá Channel" },
      { name: "description", content: "Passo a passo para conectar o WhatsApp de um cliente ao Guatá Channel." },
      { property: "og:title", content: "Conectar WhatsApp (Meta) — Guatá Channel" },
      { property: "og:description", content: "Passo a passo para conectar o WhatsApp de um cliente ao Guatá Channel." },
    ],
  }),
  component: ConectarMeta,
});

const steps = [
  ["Reunir dados do cliente", "CNPJ ou documento da empresa, site ou Instagram, e-mail e o número que será usado (de preferência WhatsApp Business no celular)."],
  ["Conta empresarial na Meta", "Em business.facebook.com, crie ou acesse o Portfólio Empresarial do cliente. Adicione você como administrador para fazer tudo por ele."],
  ["Criar o app e o WhatsApp", "Em developers.facebook.com, crie um app do tipo Empresa, adicione o produto WhatsApp e vincule ao portfólio do cliente."],
  ["Adicionar o número", "Em WhatsApp > Configuração da API, adicione o número e confirme pelo código SMS. Para continuar usando o celular, escolha a opção de coexistência com o WhatsApp Business."],
  ["Token permanente", "Em Usuários do sistema, crie um usuário administrador, atribua o app e a conta WhatsApp e gere um token com as permissões whatsapp_business_messaging e whatsapp_business_management."],
  ["Webhook", "Em WhatsApp > Configuração, cole a URL do webhook do Guatá Channel e o token de verificação (veja em Configurações). Assine o campo messages."],
  ["Pagamento da Meta", "Adicione um cartão do cliente na conta WhatsApp. A Meta cobra por conversa/modelo diretamente do cliente; a mensalidade do Guatá Channel é separada."],
  ["Testar", "Mande uma mensagem do seu celular para o número do cliente e confira se aparece em Conversas e se o Guatá responde."],
];

function ConectarMeta() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">Conectar WhatsApp de um cliente</h1>
        <p className="text-sm text-muted-foreground">
          Roteiro para você mesmo fazer a implantação pelo cliente. No futuro, o botão “Conectar
          WhatsApp” (login com Facebook) fará os passos 2 a 6 automaticamente — isso exige que o
          app do Guatá seja aprovado pela Meta como Provedor de Tecnologia.
        </p>
      </div>
      {steps.map(([t, d], i) => (
        <Card key={t} className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-3">
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center text-sm">{i + 1}</span>
              {t}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
        </Card>
      ))}
    </div>
  );
}
