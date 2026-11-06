import { describe, expect, test, mock } from "bun:test";
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { shouldTrigger, whatsappLink } = await import("./instagram.server");

describe("ponte Instagram", () => {
  test("dispara com palavra-chave sem acento", () => {
    expect(shouldTrigger("Qual o PRECO?", ["preço"], false)).toBe(true);
  });
  test("não dispara comentário comum", () => {
    expect(shouldTrigger("Que lindo!", ["quero"], false)).toBe(false);
  });
  test("pergunta só dispara com a opção ligada", () => {
    expect(shouldTrigger("Fica onde?", ["quero"], true)).toBe(true);
    expect(shouldTrigger("Fica onde?", ["quero"], false)).toBe(false);
  });
  test("link do WhatsApp usa só dígitos", () => {
    expect(whatsappLink("+55 (67) 99999-0000", "oi")).toBe("https://wa.me/5567999990000?text=oi");
  });
});
