import { describe, expect, test } from "bun:test";
import {
  historyContentFromRow,
  isTemplateButtonAccept,
  isTemplateButtonDecline,
  renderTemplateBodyPlaceholders,
  templateHistoryText,
} from "@/lib/whatsapp-template-context.server";

describe("whatsapp-template-context", () => {
  test("renderTemplateBodyPlaceholders substitui {{1}}", () => {
    expect(renderTemplateBodyPlaceholders("Oi {{1}}, tudo bem?", "Ana")).toBe("Oi Ana, tudo bem?");
  });

  test("botões SIM/NÃO", () => {
    expect(isTemplateButtonAccept("SIM")).toBe(true);
    expect(isTemplateButtonAccept("sim!")).toBe(true);
    expect(isTemplateButtonDecline("NÃO")).toBe(true);
    expect(isTemplateButtonDecline("quero viajar")).toBe(false);
  });

  test("historyContentFromRow usa template_body", () => {
    const text = historyContentFromRow("Template convite", {
      kind: "campaign_template",
      template_name: "convite",
      template_body: "Olá! Quer conhecer o Guatá?",
    });
    expect(text).toContain("convite");
    expect(text).toContain("Olá! Quer conhecer o Guatá?");
  });

  test("templateHistoryText inclui nota da campanha", () => {
    const t = templateHistoryText({
      templateName: "convite",
      bodyText: "Corpo",
      campaignNote: "lista verão",
    });
    expect(t).toContain("lista verão");
  });
});