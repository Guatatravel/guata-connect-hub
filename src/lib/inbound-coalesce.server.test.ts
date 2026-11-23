import { describe, expect, test } from "bun:test";
import {
  coalesceWindowMs,
  enqueueInboundMessage,
  shouldCoalesceInbound,
} from "@/lib/inbound-coalesce.server";
import type { IncomingMessage } from "@/lib/message-pipeline.server";

function base(partial: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    organizationId: "org",
    line: "descubra",
    phone: "5511999999999",
    text: "oi",
    inboundKind: "text",
    ...partial,
  };
}

describe("shouldCoalesceInbound", () => {
  test("text and audio yes; image/quote no", () => {
    expect(shouldCoalesceInbound(base())).toBe(true);
    expect(
      shouldCoalesceInbound(
        base({
          inboundKind: "audio",
          text: "quero o nordeste",
          mediaPath: "x",
          mediaKind: "audio",
          messageId: "wamid.audio",
        }),
      ),
    ).toBe(true);
    expect(shouldCoalesceInbound(base({ inboundKind: "image" }))).toBe(false);
    expect(shouldCoalesceInbound(base({ quotedWaMessageId: "wamid.x" }))).toBe(false);
  });
});

describe("coalesceWindowMs", () => {
  test("waits about 4 seconds", () => {
    expect(coalesceWindowMs()).toBe(4000);
  });
});

describe("enqueueInboundMessage", () => {
  test("joins two rapid texts into one process call", async () => {
    const seen: IncomingMessage[] = [];
    const p1 = enqueueInboundMessage(base({ text: "viagem pra família", phone: "5511000000001" }), async (m) => {
      seen.push(m);
      return { replies: ["ok"], sessionId: "s1" };
    });
    const p2 = enqueueInboundMessage(base({ text: "pro nordeste", phone: "5511000000001" }), async (m) => {
      seen.push(m);
      return { replies: ["ok"], sessionId: "s1" };
    });
    await Promise.all([p1, p2]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toBe("viagem pra família\npro nordeste");
  }, 8000);

  test("joins audio transcript with following text and keeps audio wamid", async () => {
    const seen: IncomingMessage[] = [];
    const phone = "5511000000002";
    const p1 = enqueueInboundMessage(
      base({
        phone,
        inboundKind: "audio",
        text: "quero o Nordeste",
        messageId: "wamid.audio1",
        mediaPath: "path/a.ogg",
        mediaKind: "audio",
      }),
      async (m) => {
        seen.push(m);
        return { replies: ["ok"], sessionId: "s2" };
      },
    );
    const p2 = enqueueInboundMessage(
      base({ phone, text: "2 adultos e 2 crianças", messageId: "wamid.text1" }),
      async (m) => {
        seen.push(m);
        return { replies: ["ok"], sessionId: "s2" };
      },
    );
    await Promise.all([p1, p2]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toBe("quero o Nordeste\n2 adultos e 2 crianças");
    expect(seen[0]!.inboundKind).toBe("audio");
    expect(seen[0]!.messageId).toBe("wamid.audio1");
    expect(seen[0]!.mediaPath).toBe("path/a.ogg");
  }, 8000);
});
