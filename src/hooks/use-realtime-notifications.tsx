import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchUnreadCounts } from "@/lib/notifications.functions";
import { toast } from "sonner";
import type { ChatMessage, Conversation } from "@/types/guata";

type LiveMessage = {
  id?: string;
  session_id?: string;
  author?: string;
  text?: string;
  created_at?: string;
  metadata?: {
    media_kind?: ChatMessage["mediaKind"];
    media_mime?: string;
    filename?: string;
    wa_message_id?: string;
  } | null;
};

function liveChatMessage(row: LiveMessage): ChatMessage | null {
  if (!row.id) return null;
  const author = row.author;
  const role: ChatMessage["role"] =
    author === "user" ? "user" : author === "bot" ? "bot" : "human";
  return {
    id: row.id,
    role,
    text: row.text ?? "",
    at: row.created_at ?? new Date().toISOString(),
    mediaKind: row.metadata?.media_kind,
    mediaMime: row.metadata?.media_mime,
    mediaFilename: row.metadata?.filename,
    waMessageId: row.metadata?.wa_message_id,
  };
}

function chatIsOpen(qc: QueryClient, sessionId?: string) {
  if (!sessionId) return false;
  return qc
    .getQueryCache()
    .findAll({ queryKey: ["conversation", sessionId] })
    .some((query) => query.getObserversCount() > 0);
}

/** Mostra a frase na lista e no chat aberto antes da busca no servidor. */
function showMessageNow(qc: QueryClient, row: LiveMessage) {
  if (!row.session_id) return;
  const text = row.text ?? "";
  const at = row.created_at ?? new Date().toISOString();
  qc.setQueriesData<Conversation[]>({ queryKey: ["conversations"] }, (list) => {
    if (!list) return list;
    return list.map((c) =>
      c.id === row.session_id
        ? {
            ...c,
            lastMessage: text || c.lastMessage,
            lastMessageAt: at,
            unseen: row.author === "user" ? true : c.unseen,
          }
        : c,
    );
  });
  const message = liveChatMessage(row);
  if (!message) return;
  qc.setQueryData<Conversation | null>(["conversation", row.session_id], (conv) => {
    if (!conv || conv.messages.some((m) => m.id === message.id)) return conv;
    return {
      ...conv,
      lastMessage: text || conv.lastMessage,
      lastMessageAt: at,
      messages: [...conv.messages, message],
    };
  });
}

const SOUND_STORAGE_KEY = "guata.notifications.sound";

function playChime() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(SOUND_STORAGE_KEY) === "off") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    /* ignore */
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SOUND_STORAGE_KEY) !== "off";
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_STORAGE_KEY, enabled ? "on" : "off");
}

/** Contadores + subscription realtime. Mantém badges vivos e dispara toast/som. */
export function useRealtimeNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const mountedAt = useRef<number>(Date.now());

  const counts = useQuery({
    queryKey: ["unread-counts"],
    queryFn: () => fetchUnreadCounts(),
    enabled: Boolean(user),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!user) return;
    const activeOrgId = counts.data?.organizationId;
    const channel = supabase
      .channel("guata-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "travel_intake" },
        async (payload) => {
          if (!activeOrgId) return;
          const sessionId = (payload.new as { session_id?: string })?.session_id;
          if (!sessionId) return;
          const { data: sess } = await supabase
            .from("sessions")
            .select("organization_id")
            .eq("id", sessionId)
            .maybeSingle();
          if (sess?.organization_id !== activeOrgId) return;
          const createdAt = (payload.new as { created_at?: string })?.created_at;
          if (createdAt && new Date(createdAt).getTime() < mountedAt.current - 5000) return;
          const protocol = (payload.new as { protocol?: string })?.protocol ?? "nova";
          const destino = (payload.new as { destino?: string })?.destino ?? "";
          toast.success(`Nova triagem ${protocol}`, {
            description: destino ? `Destino: ${destino}` : "Aguardando consultor.",
          });
          playChime();
          qc.invalidateQueries({ queryKey: ["unread-counts"] });
          qc.invalidateQueries({ queryKey: ["triagens"] });
          qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions" },
        (payload) => {
          const orgId = (payload.new as { organization_id?: string })?.organization_id;
          if (activeOrgId && orgId && orgId !== activeOrgId) return;
          const sessionId = (payload.new as { id?: string })?.id;
          if (!chatIsOpen(qc, sessionId)) {
            qc.invalidateQueries({ queryKey: ["unread-counts"] });
          }
          qc.invalidateQueries({ queryKey: ["conversations"] });
          if (sessionId) qc.invalidateQueries({ queryKey: ["conversation", sessionId] });
          const newMode = (payload.new as { mode?: string })?.mode;
          const oldMode = (payload.old as { mode?: string })?.mode;
          if (newMode === "humano" && oldMode !== "humano") {
            const phone = (payload.new as { phone?: string })?.phone ?? "";
            toast.info("Cliente pediu atendimento humano", {
              id: sessionId ? `humano-${sessionId}` : undefined,
              description: phone ? `WhatsApp: ${phone}` : undefined,
              duration: 4000,
            });
            playChime();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const row = payload.new as LiveMessage;
          if (activeOrgId && row.session_id) {
            const { data: sess } = await supabase
              .from("sessions")
              .select("organization_id")
              .eq("id", row.session_id)
              .maybeSingle();
            if (sess?.organization_id !== activeOrgId) return;
          }
          if (row.created_at && new Date(row.created_at).getTime() < mountedAt.current - 5000) return;
          await Promise.all([
            qc.cancelQueries({ queryKey: ["conversations"] }),
            row.session_id
              ? qc.cancelQueries({ queryKey: ["conversation", row.session_id] })
              : Promise.resolve(),
          ]);
          showMessageNow(qc, row);
          if (row.author === "user") {
            const lists = qc.getQueriesData<Array<{ id: string; mode?: string }>>({
              queryKey: ["conversations"],
            });
            const mode = lists
              .flatMap(([, list]) => list ?? [])
              .find((c) => c.id === row.session_id)?.mode;
            if (mode === "humano") {
              const preview = (row.text ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
              toast.info("Cliente respondeu", {
                id: row.session_id ? `reply-${row.session_id}` : undefined,
                description: preview || "Nova mensagem no atendimento humano.",
                duration: 4000,
              });
              playChime();
            }
          }
          if (!chatIsOpen(qc, row.session_id)) {
            void qc.invalidateQueries({ queryKey: ["unread-counts"] });
          }
          void qc.invalidateQueries({ queryKey: ["conversations"] });
          if (row.session_id) {
            void qc.invalidateQueries({ queryKey: ["conversation", row.session_id] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc, counts.data?.organizationId]);

  return counts.data ?? { triagensAbertas: 0, conversasHumano: 0 };
}