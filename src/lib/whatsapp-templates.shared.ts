export type TemplateHeaderMode = "none" | "text" | "image";

export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButtonInput {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export const TEMPLATE_BUTTON_LABEL: Record<TemplateButtonType, string> = {
  QUICK_REPLY: "Resposta rápida",
  URL: "Abrir site",
  PHONE_NUMBER: "Ligar / WhatsApp",
};