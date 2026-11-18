import { describe, expect, test } from "bun:test";
import {
  classifyTemplateUserReply,
  historyContentFromRow,
  isTemplateButtonAccept,
  isTemplateButtonDecline,
  isTextualDeclineAfterTemplate,
  quickReplyLabelsFromComponents,
  renderTemplateBodyPlaceholders,
  templateDeclineReply,
  templateHistoryText,
} from "@/lib/whatsapp-template-context.server";

const conviteCtx = {
  templateName: "convite",
  bodyText: "Posso salvar seu contato e te dar boas-vindas à Família Guatá?",
  sentAt: new Date().toISOString(),
  quickReplies: ["SIM", "NÃO"],
};

describe("whatsapp-template-context", () => {
  test("renderTemplateBodyPlaceholders substitui {{1}}", () => {
    expect(renderTemplateBodyPlaceholders("Oi {{1}}, tudo bem?", "Ana")).toBe("Oi Ana, tudo bem?");
  });

  test("extrai botões dos components Meta", () => {
    const labels = quickReplyLabelsFromComponents([
      { type: "BODY", text: "Oi" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "SIM" },
          { type: "QUICK_REPLY", text: "NÃO" },
        ],
      },
    ]);
    expect(labels).toEqual(["SIM", "NÃO"]);
  });

  test("classifica SIM/NÃO e texto livre", () => {
    expect(classifyTemplateUserReply("NÃO", conviteCtx)).toBe("decline");
    expect(classifyTemplateUserReply("SIM", conviteCtx)).toBe("accept");
    expect(classifyTemplateUserReply("quero roteiro em Bonito", conviteCtx)).toBe("follow_up");
    expect(isTextualDeclineAfterTemplate("não quero agora")).toBe(true);
  });

  test("botões SIM/NÃO legado", () => {
    expect(isTemplateButtonAccept("SIM")).toBe(true);
    expect(isTemplateButtonDecline("Não")).toBe(true);
  });

  test("convite NÃO sem empurrar destino", () => {
    const msg = templateDeclineReply(conviteCtx, "Ana");
    expect(msg).toContain("não vou insistir");
    expect(msg.toLowerCase()).not.toContain("destino");
  });

  test("historyContentFromRow usa template_body", () => {
    const text = historyContentFromRow("Template convite", {
      kind: "campaign_template",
      template_name: "convite",
      template_body: "Olá! Quer conhecer o Guatá?",
      template_quick_replies: ["SIM", "NÃO"],
    });
    expect(text).toContain("convite");
    expect(text).toContain("SIM");
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