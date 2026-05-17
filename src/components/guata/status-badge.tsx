import { Badge } from "@/components/ui/badge";
import type { SessionMode, TriagemStatus } from "@/types/guata";
import { cn } from "@/lib/utils";

const triagemMap: Record<TriagemStatus, { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-accent/30 text-accent-foreground border-accent" },
  atribuido: { label: "Atribuído", cls: "bg-primary/15 text-primary border-primary/30" },
  contactado: { label: "Contactado", cls: "bg-blue-100 text-blue-900 border-blue-300" },
  proposta_enviada: {
    label: "Proposta enviada",
    cls: "bg-amber-100 text-amber-900 border-amber-300",
  },
  fechado: { label: "Fechado", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  perdido: { label: "Perdido", cls: "bg-stone-200 text-stone-700 border-stone-300" },
};

const modeMap: Record<SessionMode, { label: string; cls: string }> = {
  informacional: {
    label: "Informacional",
    cls: "bg-secondary text-secondary-foreground border-border",
  },
  triagem: { label: "Triagem", cls: "bg-accent/30 text-accent-foreground border-accent" },
  humano: { label: "Humano", cls: "bg-primary text-primary-foreground border-primary" },
  aguardando: {
    label: "Aguardando",
    cls: "bg-amber-100 text-amber-900 border-amber-300",
  },
};

export function TriagemStatusBadge({ status }: { status: TriagemStatus }) {
  const m = triagemMap[status];
  return (
    <Badge variant="outline" className={cn("font-medium", m.cls)}>
      {m.label}
    </Badge>
  );
}

export function SessionModeBadge({ mode }: { mode: SessionMode }) {
  const m = modeMap[mode];
  return (
    <Badge variant="outline" className={cn("font-medium", m.cls)}>
      {m.label}
    </Badge>
  );
}