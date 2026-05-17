import { Badge } from "@/components/ui/badge";
import type { WhatsAppLine } from "@/types/guata";
import { cn } from "@/lib/utils";

const map: Record<WhatsAppLine, { label: string; cls: string }> = {
  descubra_ms: {
    label: "Descubra MS",
    cls: "bg-primary/15 text-primary border-primary/40",
  },
  guata_viagens: {
    label: "Guatá Viagens",
    cls: "bg-accent/30 text-accent-foreground border-accent",
  },
};

export function LineBadge({ line }: { line: WhatsAppLine }) {
  const m = map[line];
  return (
    <Badge variant="outline" className={cn("font-medium", m.cls)}>
      {m.label}
    </Badge>
  );
}