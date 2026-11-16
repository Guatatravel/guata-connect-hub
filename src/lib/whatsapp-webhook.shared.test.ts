import { describe, expect, test } from "bun:test";
import {
  echoTextFromRecord,
  phoneEchoesFromValue,
  webhookEventKind,
  webhookPreview,
} from "./whatsapp-webhook.shared";

describe("webhook coexistência", () => {
  test("reconhece eco do WhatsApp Business", () => {
    const value = {
      smb_message_echoes: [{ to: "5567999999999", text: { body: "Oi" }, type: "text" }],
    };
    expect(webhookEventKind(value)).toBe("phone_echo");
    expect(webhookPreview(value)).toContain("Eco do celular");
  });

  test("prioriza mensagem de cliente sobre eco vazio", () => {
    const value = {
      messages: [{ from: "5567111111111", text: { body: "Olá" }, type: "text" }],
      smb_message_echoes: [],
    };
    expect(webhookEventKind(value)).toBe("message");
    expect(phoneEchoesFromValue(value)).toHaveLength(0);
  });
});