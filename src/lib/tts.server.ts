/**
 * Texto → áudio para respostas do bot no WhatsApp.
 *
 * Env (opcional, use um provedor):
 * - ELEVENLABS_API_KEY + GUATA_TTS_VOICE_MALE_ID / GUATA_TTS_VOICE_FEMALE_ID
 * - OPENAI_API_KEY + GUATA_TTS_OPENAI_VOICE_MALE (default onyx) / GUATA_TTS_OPENAI_VOICE_FEMALE (default nova)
 */
import { normalizeAgencyNameInText } from "@/lib/agency-branding";
import type { BotVoiceProfile } from "@/lib/bot-audio-preference.server";

const MAX_SPEECH_CHARS = 700;

export function plainTextForSpeech(text: string): string {
  return normalizeAgencyNameInText(
    text
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/https?:\/\/[^\s]+/gi, " link na mensagem ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, MAX_SPEECH_CHARS);
}

function maleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_MALE_ID?.trim() ||
    null
  );
}

function femaleVoiceId(): string | null {
  return (
    process.env.ELEVENLABS_VOICE_FEMALE_ID?.trim() ||
    process.env.GUATA_TTS_VOICE_FEMALE_ID?.trim() ||
    null
  );
}

function elevenLabsTtsReady(): boolean {
  return Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() && (maleVoiceId() || femaleVoiceId()),
  );
}

/** True se OpenAI ou ElevenLabs (com voice id) estiverem prontos. */
export function isBotTtsConfigured(): boolean {
  return elevenLabsTtsReady() || Boolean(process.env.OPENAI_API_KEY?.trim());
}

export interface TtsConfigStatus {
  configured: boolean;
  elevenLabsKey: boolean;
  maleVoiceId: boolean;
  femaleVoiceId: boolean;
  openAiKey: boolean;
  summary: string;
}

export function getTtsConfigStatus(): TtsConfigStatus {
  const elevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY?.trim());
  const male = Boolean(maleVoiceId());
  const female = Boolean(femaleVoiceId());
  const openAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  const configured = isBotTtsConfigured();
  let summary = "Nenhum provedor de voz configurado no servidor.";
  if (elevenLabsKey && !male && !female) {
    summary =
      "ELEVENLABS_API_KEY presente, mas falta GUATA_TTS_VOICE_MALE_ID ou ELEVENLABS_VOICE_ID.";
  } else if (elevenLabsTtsReady()) {
    summary = `ElevenLabs pronto (voz${male && female ? " M+F" : male ? " M" : " F"}).`;
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

function voiceIdFor(profile: BotVoiceProfile): string | null {
  if (profile === "female") return femaleVoiceId() || maleVoiceId();
  return maleVoiceId() || femaleVoiceId();
}

function openAiVoice(profile: BotVoiceProfile): string {
  if (profile === "female") {
    return process.env.GUATA_TTS_OPENAI_VOICE_FEMALE?.trim() || "nova";
  }
  return process.env.GUATA_TTS_OPENAI_VOICE_MALE?.trim() || "onyx";
}

async function synthesizeElevenLabs(
  text: string,
  profile: BotVoiceProfile,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = voiceIdFor(profile);
  if (!key || !voiceId) {
    return { error: "elevenlabs_missing_key_or_voice_id" };
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[tts] elevenlabs:", res.status, body);
    return { error: `elevenlabs_${res.status}: ${body.slice(0, 120)}` };
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()) };
}

async function synthesizeOpenAi(
  text: string,
  profile: BotVoiceProfile,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return { error: "openai_key_missing" };

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
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[tts] openai:", res.status, body);
    return { error: `openai_${res.status}: ${body.slice(0, 120)}` };
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()) };
}

export type SynthesizeResult =
  | { ok: true; bytes: Uint8Array; mimeType: string }
  | { ok: false; reason: string };

export async function synthesizeBotSpeechDetailed(
  text: string,
  profile: BotVoiceProfile,
): Promise<SynthesizeResult> {
  const spoken = plainTextForSpeech(text);
  if (!spoken || spoken.length < 3) {
    return { ok: false, reason: "texto_curto_para_voz" };
  }

  if (elevenLabsTtsReady()) {
    const el = await synthesizeElevenLabs(spoken, profile);
    if ("bytes" in el && el.bytes.length > 0) {
      return { ok: true, bytes: el.bytes, mimeType: "audio/mpeg" };
    }
    const elErr = "error" in el ? el.error : "elevenlabs_empty";
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return { ok: false, reason: elErr };
    }
  }

  const oa = await synthesizeOpenAi(spoken, profile);
  if ("bytes" in oa && oa.bytes.length > 0) {
    return { ok: true, bytes: oa.bytes, mimeType: "audio/mpeg" };
  }
  const oaErr = "error" in oa ? oa.error : "openai_empty";
  return { ok: false, reason: oaErr };
}

export async function synthesizeBotSpeech(
  text: string,
  profile: BotVoiceProfile,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const r = await synthesizeBotSpeechDetailed(text, profile);
  return r.ok ? { bytes: r.bytes, mimeType: r.mimeType } : null;
}

/** Gera ~1s de áudio para diagnóstico no painel. */
export async function probeBotTts(
  profile: BotVoiceProfile = "male",
): Promise<{ ok: boolean; detail: string }> {
  const cfg = getTtsConfigStatus();
  if (!cfg.configured) {
    return { ok: false, detail: cfg.summary };
  }
  const r = await synthesizeBotSpeechDetailed("Teste de voz do Guatá.", profile);
  if (r.ok) {
    return {
      ok: true,
      detail: `${cfg.summary} Áudio gerado (${r.bytes.length} bytes).`,
    };
  }
  return { ok: false, detail: `${cfg.summary} Falha: ${r.reason}` };
}
