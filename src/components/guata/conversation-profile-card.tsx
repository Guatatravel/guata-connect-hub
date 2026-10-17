import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { SessionModeBadge } from "@/components/guata/status-badge";
import { formatPhone, timeAgo, waLink } from "@/lib/format";
import type { Conversation } from "@/types/guata";
import { MessageCircle, User } from "lucide-react";

export function ConversationProfileCard({ conv }: { conv: Conversation }) {
  const display = conv.contactName ?? formatPhone(conv.phone);
  const initials = display.slice(0, 2).toUpperCase();

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4 flex flex-wrap gap-4 items-center">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-lg bg-primary/15 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-[200px] space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-semibold text-lg">{display}</span>
            <SessionModeBadge mode={conv.mode} />
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            Cliente no WhatsApp · {formatPhone(conv.phone)}
          </p>
          {conv.createdAt && (
            <p className="text-xs text-muted-foreground">
              Primeiro contato {timeAgo(conv.createdAt)}
            </p>
          )}
          {conv.assignedToName && (
            <p className="text-xs text-muted-foreground">Consultor: {conv.assignedToName}</p>
          )}
        </div>
        <a
          href={waLink(conv.phone)}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary inline-flex items-center gap-1 hover:underline"
        >
          <MessageCircle className="h-4 w-4" />
          Abrir no WhatsApp
        </a>
      </CardContent>
    </Card>
  );
}
