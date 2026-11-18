import { describe, expect, test } from "bun:test";
import { parsePhoneList } from "@/lib/campaigns.server";
import { panelMessagePreview } from "@/lib/whatsapp-template-context.server";

describe("parsePhoneList", () => {
  test("aceita DDD e celular na mesma linha com espaço", () => {
    const raw = "67 99248-3469\n67 8406-1395";
    const out = parsePhoneList(raw);
    expect(out).toEqual(["55679992483469", "556784061395"]);
  });

  test("aceita só dígitos", () => {
    expect(parsePhoneList("67992483469")).toEqual(["55679992483469"]);
  });
});

describe("panelMessagePreview", () => {
  test("mostra trecho do template_body", () => {
    const text = panelMessagePreview("Template convite", {
      kind: "campaign_template",
      template_name: "convite",
      template_body: "Olá! Eu sou o Guatá!\nQuer conversar?",
    });
    expect(text).toContain("convite");
    expect(text).toContain("Olá!");
  });
});