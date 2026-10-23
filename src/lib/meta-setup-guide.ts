/** Passo a passo Meta WhatsApp (links oficiais) — usado no painel. */
export const META_WHATSAPP_SETUP = [
  {
    title: "1. Conta e app na Meta",
    body:
      "Entre com a conta que administra o WhatsApp da agência. Crie ou abra um app em Meta for Developers e adicione o produto WhatsApp.",
    links: [
      { label: "Meta for Developers", href: "https://developers.facebook.com/" },
      { label: "Meus apps", href: "https://developers.facebook.com/apps/" },
    ],
  },
  {
    title: "2. WhatsApp Business (WABA e número)",
    body:
      "No Gerenciador de Negócios, vincule ou crie uma conta WhatsApp Business e adicione o número que o cliente vai usar. Anote o WABA ID e o Phone number ID.",
    links: [
      {
        label: "Configurações do WhatsApp (Business)",
        href: "https://business.facebook.com/latest/settings/whatsapp_account",
      },
      {
        label: "Documentação — Cloud API",
        href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
      },
    ],
  },
  {
    title: "3. Token de acesso",
    body:
      "Gere um token permanente (System User ou usuário com permissão) com whatsapp_business_messaging e whatsapp_business_management. Cole abaixo em Access Token.",
    links: [
      {
        label: "Tokens do app",
        href: "https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-user-access-tokens",
      },
    ],
  },
  {
    title: "4. Webhook",
    body:
      "Em WhatsApp > Configuração, defina a URL do webhook (em Configurações do Guatá Channel), o Verify Token (secret META_VERIFY_TOKEN) e assine o campo messages.",
    links: [
      { label: "Abrir Configurações do Guatá", href: "/configuracoes", internal: true },
    ],
  },
  {
    title: "5. Salvar no painel",
    body:
      "Preencha WABA ID, Phone Number ID e o token nesta página e clique em Salvar canal. Teste enviando uma mensagem ao número.",
    links: [],
  },
] as const;
