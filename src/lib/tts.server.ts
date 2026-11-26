/**
 * Texto → áudio para respostas do bot no WhatsApp.
 *
 * Prioridade ElevenLabs: chave/vozes da agência (painel) → env do servidor.
 * Fallback: OPENAI_API_KEY.
 */
import { normalizeAgencyNameInText } from "@/lib/agency-branding";
import type { BotVoiceProfile } from "@/lib/bot-audio-preference.server";
import type { OrgElevenLabsCreds } from "@/lib/org-tts.server";

const MAX_SPEECH_CHARS = 700;

export type TtsOrgOverride = Partial<OrgElevenLabsCreds> | null | undefined;

export function plainTextForSpeech(text: string): string {
  return normalizeAgencyNameInText(
    text
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/https?:\/\/[^\s]+/gi, " link na mensagem ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, MAX_SPEECH_CHARS);
}

function envMaleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_MALE_ID?.trim() ||
    null
  );
}

function envFemaleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_FEMALE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_FEMALE_ID?.trim() ||
    null
  );
}

function resolveElevenLabsKey(org?: TtsOrgOverride): string | null {
  if (org?.useOwn && org.apiKey?.trim()) return org.apiKey.trim();
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

function maleVoiceId(org?: TtsOrgOverride): string | null {
  return org?.voiceMaleId?.trim() || envMaleVoiceId();
}

function femaleVoiceId(org?: TtsOrgOverride): string | null {
  return org?.voiceFemaleId?.trim() || envFemaleVoiceId();
}

function elevenLabsTtsReady(org?: TtsOrgOverride): boolean {
  const key = resolveElevenLabsKey(org);
  return Boolean(key && (maleVoiceId(org) || femaleVoiceId(org)));
}

/** True se OpenAI ou ElevenLabs (com voice id) estiverem prontos. */
export function isBotTtsConfigured(org?: TtsOrgOverride): boolean {
  return elevenLabsTtsReady(org) || Boolean(process.env.OPENAI_API_KEY?.trim());
}

export interface TtsConfigStatus {
  configured: boolean;
  elevenLabsKey: boolean;
  maleVoiceId: boolean;
  femaleVoiceId: boolean;
  openAiKey: boolean;
  summary: string;
}

export function getTtsConfigStatus(org?: TtsOrgOverride): TtsConfigStatus {
  const elevenLabsKey = Boolean(resolveElevenLabsKey(org));
  const male = Boolean(maleVoiceId(org) || (org?.useOwn ? envMaleVoiceId() : null));
  const female = Boolean(femaleVoiceId(org) || (org?.useOwn ? envFemaleVoiceId() : null));
  const openAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const configured = isBotTtsConfigured(org);
  let summary = "Nenhum provedor de voz configurado.";
  if (elevenLabsKey && !maleVoiceId(org) && !femaleVoiceId(org) && !envMaleVoiceId() && !envFemaleVoiceId()) {
    summary = "ElevenLabs com chave, mas falta ID de voz (masculina ou feminina).";
  } else if (elevenLabsTtsReady(org)) {
    const m = Boolean(maleVoiceId(org) || envMaleVoiceId());
    const f = Boolean(femaleVoiceId(org) || envFemaleVoiceId());
    summary = `ElevenLabs pronto (voz${m && f ? " M+F" : m ? " M" : " F"}${org?.useOwn ? ", chave da agência" : ", servidor"}).`;
  } else if (openAiKey) {
    summary = "OpenAI TTS configurado (fallback).";
  }
  return {
    configured,
    elevenLabsKey,
    maleVoiceId: male,
    femaleVoiceId: female,
    openAiKey,
    summary,
  };
}

function voiceIdFor(profile: BotVoiceProfile, org?: TtsOrgOverride): string | null {
  if (profile === "female") {
    return femaleVoiceId(org) || envFemaleVoiceId() || maleVoiceId(org) || envMaleVoiceId();
  }
  return maleVoiceId(org) || envMaleVoiceId() || femaleVoiceId(org) || envFemaleVoiceId();
}

function openAiVoice(profile: BotVoiceProfile): string {
  if (profile === "female") {
    return process.env.GUATA_TTS_OPENAI_VOICE_FEMALE?.trim() || "nova";
  }
  return process.env.GUATA_TTS_OPENAI_VOICE_MALE?.trim() || "onyx";
}

function isOgg(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  );
}

async function requestElevenLabs(
  voiceId: string,
  key: string,
  text: string,
  outputFormat?: string,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const query = outputFormat ? `?output_format=${outputFormat}` : "";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${query}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: outputFormat?.startsWith("opus") ? "audio/ogg" : "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[tts] elevenlabs:", res.status, outputFormat ?? "mp3", body);
    return { error: `elevenlabs_${res.status}: ${body.slice(0, 120)}` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) return { error: "elevenlabs_empty" };
  return { bytes };
}

/** OGG Opus vira nota de voz no WhatsApp. Se o formato falhar, cai para MP3. */
async function synthesizeElevenLabs(
  text: string,
  profile: BotVoiceProfile,
  org?: TtsOrgOverride,
): Promise<{ bytes: Uint8Array; mimeType: string } | { error: string }> {
  const key = resolveElevenLabsKey(org);
  const voiceId = voiceIdFor(profile, org);
  if (!key || !voiceId) {
    return { error: "elevenlabs_missing_key_or_voice_id" };
  }

  const opus = await requestElevenLabs(voiceId, key, text, "opus_48000_64");
  if ("bytes" in opus && isOgg(opus.bytes)) return { bytes: opus.bytes, mimeType: "audio/ogg" };

  const mp3 = await requestElevenLabs(voiceId, key, text);
  if ("bytes" in mp3) return { bytes: mp3.bytes, mimeType: "audio/mpeg" };
  return { error: "error" in mp3 ? mp3.error : "error" in opus ? opus.error : "tts_empty" };
}

async function requestOpenAi(
  key: string,
  text: string,
  profile: BotVoiceProfile,
  format: "opus" | "mp3",
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GUATA_TTS_OPENAI_MODEL?.trim() || "gpt-4o-mini-tts",
      input: text,
      voice: openAiVoice(profile),
      response_format: format,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[tts] openai:", res.status, format, body);
    return { error: `openai_${res.status}: ${body.slice(0, 120)}` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length === 0) return { error: "openai_empty" };
  return { bytes };
}

async function synthesizeOpenAi(
  text: string,
  profile: BotVoiceProfile,
): Promise<{ bytes: Uint8Array; mimeType: string } | { error: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { error: "openai_key_missing" };

  const opus = await requestOpenAi(key, text, profile, "opus");
  if ("bytes" in opus && isOgg(opus.bytes)) return { bytes: opus.bytes, mimeType: "audio/ogg" };

  const mp3 = await requestOpenAi(key, text, profile, "mp3");
  if ("bytes" in mp3) return { bytes: mp3.bytes, mimeType: "audio/mpeg" };
  return { error: "error" in mp3 ? mp3.error : "error" in opus ? opus.error : "tts_empty" };
}

export type SynthesizeResult =
  | { ok: true; bytes: Uint8Array; mimeType: string }
  | { ok: false; reason: string };

export async function synthesizeBotSpeechDetailed(
  text: string,
  profile: BotVoiceProfile,
  org?: TtsOrgOverride,
): Promise<SynthesizeResult> {
  const spoken = plainTextForSpeech(text);
  if (!spoken || spoken.length < 3) {
    return { ok: false, reason: "texto_curto_para_voz" };
  }

  if (elevenLabsTtsReady(org)) {
    const el = await synthesizeElevenLabs(spoken, profile, org);
    if ("bytes" in el && el.bytes.length > 0) {
      return { ok: true, bytes: el.bytes, mimeType: el.mimeType };
    }
    const elErr = "error" in el ? el.error : "elevenlabs_empty";
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return { ok: false, reason: elErr };
    }
  }

  const oa = await synthesizeOpenAi(spoken, profile);
  if ("bytes" in oa && oa.bytes.length > 0) {
    return { ok: true, bytes: oa.bytes, mimeType: oa.mimeType };
  }
  const oaErr = "error" in oa ? oa.error : "openai_empty";
  return { ok: false, reason: oaErr };
}

export async function synthesizeBotSpeech(
  text: string,
  profile: BotVoiceProfile,
  org?: TtsOrgOverride,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const r = await synthesizeBotSpeechDetailed(text, profile, org);
  return r.ok ? { bytes: r.bytes, mimeType: r.mimeType } : null;
}

/** Gera ~1s de áudio para diagnóstico no painel. */
export async function probeBotTts(
  profile: BotVoiceProfile = "male",
  org?: TtsOrgOverride,
): Promise<{ ok: boolean; detail: string }> {
  const cfg = getTtsConfigStatus(org);
  if (!cfg.configured) {
    return { ok: false, detail: cfg.summary };
  }
  const r = await synthesizeBotSpeechDetailed("Teste de voz do BOT.", profile, org);
  if (r.ok) {
    return {
      ok: true,
      detail: `${cfg.summary} Áudio gerado (${r.bytes.length} bytes).`,
    };
  }
  return { ok: false, detail: `${cfg.summary} Falha: ${r.reason}` };
}
