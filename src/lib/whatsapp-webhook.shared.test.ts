import { describe, expect, test } from "bun:test";
import {
  echoTextFromRecord,
  iterateWebhookChanges,
  phoneEchoesFromValue,
  webhookEventKindFromPayload,
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

  test("lê ecoo em change separado (campo smb_message_echoes)", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "106540352242922" },
                statuses: [{ id: "st1", status: "delivered", recipient_id: "5567" }],
              },
            },
            {
              field: "smb_message_echoes",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "106540352242922" },
                message_echoes: [{ to: "5567999999999", text: { body: "Do app" }, type: "text" }],
              },
            },
          ],
        },
      ],
    };
    expect(iterateWebhookChanges(payload)).toHaveLength(2);
    expect(webhookEventKindFromPayload(payload)).toBe("phone_echo");
    expect(phoneEchoesFromValue(payload.entry[0].changes[1].value)).toHaveLength(1);
  });

  test("reconhece history de coexistência", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "history",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "106540352242922" },
                history: [
                  {
                    metadata: { phase: 0, chunk_order: 1, progress: 10 },
                    threads: [
                      {
                        id: "5567111111111",
                        messages: [
                          {
                            from: "5567111111111",
                            from_user_id: "US.x",
                            id: "wamid.hist1",
                            timestamp: "1739230970",
                            type: "text",
                            text: { body: "Oi antigo" },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(webhookEventKindFromPayload(payload)).toBe("history");
    expect(webhookPreview(payload.entry[0].changes[0].value)).toContain("Histórico coexistência");
  });
});