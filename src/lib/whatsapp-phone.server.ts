/** Telefone WhatsApp só com dígitos (DDI + número), para bater com sessions.phone. */
export function canonicalWaPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}