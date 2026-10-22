/**
 * Preferência do cliente: respostas em áudio espelham o canal (voz → voz, texto → texto).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getOrgBotAudioPolicy } from "@/lib/bot-audio-org.server";
import { isBotTtsConfigured } from "@/lib/tts.server";

export type BotVoiceProfile = "male" | "female";

export interface BotAudioPrefs {
  /** Cliente pediu só texto — não responder em áudio mesmo se mandar voz. */
  textOnly: boolean;
  voice: BotVoiceProfile;
}

const INTAKE_TEXT_ONLY = "bot_audio_text_only";
const INTAKE_VOICE = "bot_voice_profile";
const INTAKE_VOICE_CLIENT = "bot_voice_client_set";

export function readBotAudioPrefs(
  intake: Record<string, unknown> | undefined,
): BotAudioPrefs {
  const voice = intake?.[INTAKE_VOICE];
  return {
    textOnly: intake?.[INTAKE_TEXT_ONLY] === true,
    voice: voice === "female" ? "female" : "male",
  };
}

/** Responde em áudio nesta troca se o cliente mandou nota de voz e não pediu só texto. */
export function shouldSendAudioReply(
  intake: Record<string, unknown> | undefined,
  inboundKind: "text" | "image" | "audio" | "unsupported" | undefined,
): boolean {
  if (inboundKind !== "audio") return false;
  return !readBotAudioPrefs(intake).textOnly;
}

/** Voz TTS: preferência explícita do cliente no WhatsApp, senão padrão do atendente. */
export function resolveTtsVoice(
  intake: Record<string, unknown> | undefined,
  attendantVoice: BotVoiceProfile | null | undefined,
): BotVoiceProfile {
  if (intake?.[INTAKE_VOICE_CLIENT] === true) {
    return readBotAudioPrefs(intake).voice;
  }
  return attendantVoice ?? "male";
}

export type AudioPrefCommandResult =
  | { handled: false }
  | { handled: true; reply: string; prefs?: BotAudioPrefs };

function isShortAudioPreferenceCommand(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && t.length <= 120;
}

export async function handleBotAudioPreferenceMessage(
  sessionId: string,
  intake: Record<string, unknown>,
  text: string,
  organizationId: string,
  inboundKind?: "text" | "image" | "audio" | "unsupported",
): Promise<AudioPrefCommandResult> {
  // Comandos só em texto digitado — transcrição de áudio não deve ativar "só texto" etc.
  if (inboundKind && inboundKind !== "text") {
    return { handled: false };
  }

  const raw = text.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const orgPolicy = await getOrgBotAudioPolicy(organizationId);

  if (
    /\b(opcoes de audio|opcao de audio|configurar audio|preferencia de audio|como funciona o audio)\b/i.test(
      raw,
    )
  ) {
    const p = readBotAudioPrefs(intake);
    const modo = p.textOnly ? "só texto" : "voz quando você manda áudio";
    const voz = p.voice === "female" ? "feminina" : "masculina";
    return {
      handled: true,
      reply:
        "Áudio do Guatá:\n\n" +
        "• Mando *áudio* quando você me envia *nota de voz*.\n" +
        "• Mando *texto* quando você *escreve*.\n" +
        "• *Só texto* — não mando áudio mesmo em nota de voz.\n" +
        "• *Voz masculina* / *voz feminina* — tom da voz.\n\n" +
        `Agora: *${modo}*, voz *${voz}*.`,
      prefs: p,
    };
  }

  if (
    isShortAudioPreferenceCommand(raw) &&
    /\b(ativar audio|quero audio|resposta em audio|responder em audio|modo audio|com audio)\b/i.test(
      raw,
    )
  ) {
    if (!orgPolicy.allowBotAudio) {
      return {
        handled: true,
        reply:
          "No momento sua agência atende só por *texto* no WhatsApp. Se quiser ouvir o Guatá em áudio, peça ao consultor sobre o add-on de voz.",
        prefs: readBotAudioPrefs(intake),
      };
    }
    const prefs = await persistBotAudioPrefs(sessionId, intake, { textOnly: false });
    const ttsNote = isBotTtsConfigured()
      ? ""
      : "\n\n(O servidor de voz ainda não está configurado — por enquanto você recebe só texto.)";
    return {
      handled: true,
      reply:
        "Combinado! Quando você me mandar *áudio*, eu respondo em voz. Quando *escrever*, respondo em texto." +
        ttsNote,
      prefs,
    };
  }

  if (
    isShortAudioPreferenceCommand(raw) &&
    /^(desativar audio|sem audio|so texto|apenas texto|modo texto|nao quero audio|não quero audio)[\s!.?]*$/i.test(
      raw.trim(),
    )
  ) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { textOnly: true });
    return {
      handled: true,
      reply: "Beleza! Respondo só em *texto*, mesmo se você mandar áudio. Para voltar ao normal, digite *ativar áudio*.",
      prefs,
    };
  }

  if (/\b(voz feminina|voz de mulher|voz mulher)\b/i.test(raw)) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { voice: "female" });
    return {
      handled: true,
      reply: `Voz *feminina* salva para quando eu responder em áudio.`,
      prefs,
    };
  }

  if (/\b(voz masculina|voz de homem|voz homem)\b/i.test(raw)) {
    const prefs = await persistBotAudioPrefs(sessionId, intake, { voice: "male" });
    return {
      handled: true,
      reply: `Voz *masculina* do Guatá salva para quando eu responder em áudio.`,
      prefs,
    };
  }

  return { handled: false };
}

export async function persistBotAudioPrefs(
  sessionId: string,
  intake: Record<string, unknown>,
  patch: Partial<BotAudioPrefs> & { enabled?: boolean },
): Promise<BotAudioPrefs> {
  const current = readBotAudioPrefs(intake);
  const next: BotAudioPrefs = {
    textOnly: patch.textOnly ?? current.textOnly,
    voice: patch.voice ?? current.voice,
  };
  if (patch.enabled === false) next.textOnly = true;
  if (patch.enabled === true) next.textOnly = false;

  const intake_data: Record<string, unknown> = {
    ...intake,
    [INTAKE_TEXT_ONLY]: next.textOnly,
    [INTAKE_VOICE]: next.voice,
    ...(patch.voice !== undefined ? { [INTAKE_VOICE_CLIENT]: true } : {}),
    bot_audio_enabled: false,
    bot_audio_updated_at: new Date().toISOString(),
  };
  await supabaseAdmin
    .from("sessions")
    .update({ intake_data: intake_data as never })
    .eq("id", sessionId);
  return next;
}
