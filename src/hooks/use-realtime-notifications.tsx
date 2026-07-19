import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchUnreadCounts } from "@/lib/notifications.functions";
import { toast } from "sonner";

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
    const channel = supabase
      .channel("guata-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "travel_intake" },
        (payload) => {
          // Ignora eventos antigos que possam chegar no reconnect
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
          const newMode = (payload.new as { mode?: string })?.mode;
          const oldMode = (payload.old as { mode?: string })?.mode;
          if (newMode === "humano" && oldMode !== "humano") {
            const phone = (payload.new as { phone?: string })?.phone ?? "";
            toast.info("Cliente pediu atendimento humano", {
              description: phone ? `WhatsApp: ${phone}` : undefined,
            });
            playChime();
            qc.invalidateQueries({ queryKey: ["unread-counts"] });
            qc.invalidateQueries({ queryKey: ["conversations"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return counts.data ?? { triagensAbertas: 0, conversasHumano: 0 };
}