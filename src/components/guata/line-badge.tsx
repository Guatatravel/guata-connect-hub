import { Badge } from "@/components/ui/badge";
import type { WhatsAppLine } from "@/types/guata";
import { cn } from "@/lib/utils";
import { lineBadgeLabel, type OrgLineUi } from "@/lib/org-ui";

const cls = "bg-primary/15 text-primary border-primary/40";

export function LineBadge({
  line,
  org,
}: {
  line: WhatsAppLine;
  org?: OrgLineUi;
}) {
  const label = org ? lineBadgeLabel(line, org) : "Guatá";
  return (
    <Badge variant="outline" className={cn("font-medium", cls)}>
      {label}
    </Badge>
  );
}
