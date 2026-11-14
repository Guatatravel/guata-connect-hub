import { describe, expect, test } from "bun:test";
import {
  connectionForViewer,
  embeddedLoginOptions,
  metaConnectionError,
  embeddedSignupToast,
  parseEmbeddedSignupMessage,
  pickPhoneNumber,
  pickWabaId,
  publicWhatsAppConnection,
  readOAuthAccessToken,
} from "./whatsapp-embedded.shared";

const session = JSON.stringify({
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
  data: {
    waba_id: "111122223333",
    phone_number_id: "444455556666",
    current_step: "FINISH",
  },
});

describe("WhatsApp embedded signup", () => {
  test("login options keep the coexistence config", () => {
    expect(embeddedLoginOptions()).toEqual({
      config_id: "1148937487787969",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    });
  });

  test("captures the official signup event from Facebook", () => {
    expect(parseEmbeddedSignupMessage("https://www.facebook.com", session)).toEqual({
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      wabaId: "111122223333",
      phoneNumberId: "444455556666",
      currentStep: "FINISH",
      errorMessage: undefined,
    });
  });

  test("ignores other sites and unrelated messages", () => {
    expect(parseEmbeddedSignupMessage("https://evil.example", session)).toBeNull();
    expect(parseEmbeddedSignupMessage("https://web.facebook.com", "not-json")).toBeNull();
    expect(parseEmbeddedSignupMessage("https://www.facebook.com", JSON.stringify({ type: "other" }))).toBeNull();
  });

  test("uses the session account when the token confirms it", () => {
    const scopes = [{ scope: "whatsapp_business_management", target_ids: ["111122223333"] }];
    expect(pickWabaId("111122223333", scopes)).toBe("111122223333");
    expect(pickWabaId(undefined, scopes)).toBe("111122223333");
  });

  test("refuses an account outside the granted token", () => {
    const scopes = [{ scope: "whatsapp_business_messaging", target_ids: ["999000111"] }];
    expect(() => pickWabaId("111122223333", scopes)).toThrow(/não pertence/);
    expect(embeddedSignupToast({ event: "CANCEL" }, true)).toMatch(/cancelada/);
    expect(embeddedSignupToast(null, true)).toMatch(/fechada/);
  });

  test("selects the only phone or the one chosen in the popup", () => {
    const phones = [
      { id: "444455556666", display_phone_number: "line-a", verified_name: "desk" },
      { id: "777788889999", display_phone_number: "line-b" },
    ];
    expect(pickPhoneNumber("777788889999", phones).display_phone_number).toBe("line-b");
    expect(pickPhoneNumber(undefined, [phones[0]!]).id).toBe("444455556666");
    expect(() => pickPhoneNumber(undefined, phones)).toThrow(/mais de um número/);
  });

  test("reads a business token from json or form body", () => {
    expect(readOAuthAccessToken('{"access_token":"business-token","token_type":"bearer"}')).toBe("business-token");
    expect(readOAuthAccessToken("access_token=business-token&token_type=bearer")).toBe("business-token");
    expect(() => readOAuthAccessToken('{"error":{"message":"authorization code has been used"}}')).toThrow(/expir/);
  });

  test("the browser payload never includes the access token", () => {
    expect(
      publicWhatsAppConnection({
        accessToken: "business-token",
        phoneNumberId: "444455556666",
        wabaId: "111122223333",
        displayPhone: "line-a",
      }),
    ).toEqual({
      connected: true,
      phoneNumberId: "444455556666",
      wabaId: "111122223333",
      displayPhone: "line-a",
      verifiedName: null,
    });
    expect(metaConnectionError(403, { error: { message: "permission denied" } })).toMatch(/permiss/);
  });

  test("members do not receive the phone, profile or account ids", () => {
    const full = publicWhatsAppConnection({
      phoneNumberId: "444455556666",
      wabaId: "111122223333",
      displayPhone: "line-a",
      verifiedName: "desk",
    });
    expect(connectionForViewer(full, false)).toEqual({
      connected: true,
      displayPhone: null,
      verifiedName: null,
      phoneNumberId: null,
      wabaId: null,
    });
    expect(connectionForViewer(full, true)).toEqual(full);
  });
});
