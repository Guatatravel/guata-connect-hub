import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listQuickReplies,
  scheduleFollowUp,
  updateConversationCrm,
} from "@/lib/crm.functions";
import { CRM_COLUMNS, CRM_GUIDES, columnLabel } from "@/lib/crm.shared";
import type { Conversation } from "@/types/guata";

export function CrmPanel({
  conv,
  onUseReply,
}: {
  conv: Conversation;
  onUseReply: (text: string) => void;
}) {
  const qc = useQueryClient();
  const saveCrm = useServerFn(updateConversationCrm);
  const schedule = useServerFn(scheduleFollowUp);
  const loadReplies = useServerFn(listQuickReplies);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(2);
  const [followText, setFollowText] = useState(conv.followUp?.text ?? "");
  const [templateName, setTemplateName] = useState(conv.followUp?.templateName ?? "");

  const replies = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => loadReplies(),
  });

  const crm = useMutation({
    mutationFn: saveCrm,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const follow = useMutation({
    mutationFn: () =>
      schedule({
        data: {
          id: conv.id,
          days,
          text: followText,
          templateName: templateName.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Follow-up marcado");
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labels = conv.crmLabels ?? [];

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-display">Organização</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={conv.crmGuide ?? ""}
            onChange={(e) =>
              crm.mutate({ data: { id: conv.id, guide: e.target.value || null } })
            }
          >
            <option value="">Sem guia</option>
            {CRM_GUIDES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
            {conv.crmGuide && !CRM_GUIDES.includes(conv.crmGuide as (typeof CRM_GUIDES)[number]) && (
              <option value={conv.crmGuide}>{conv.crmGuide}</option>
            )}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2"
            value={conv.crmColumn ?? ""}
            onChange={(e) =>
              crm.mutate({
                data: {
                  id: conv.id,
                  column: (e.target.value || null) as Conversation["crmColumn"] | null,
                },
              })
            }
          >
            <option value="">Sem coluna</option>
            {CRM_COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border bg-background px-2"
            defaultValue=""
            onChange={(e) => {
              const body = replies.data?.replies.find((r) => r.id === e.target.value)?.body;
              if (body) onUseReply(body);
              e.target.value = "";
            }}
          >
            <option value="">Resposta rápida…</option>
            {(replies.data?.replies ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {labels.map((item) => (
            <button
              key={item}
              type="button"
              className="rounded-full bg-secondary px-2 py-0.5 text-xs"
              title="Tirar etiqueta"
              onClick={() =>
                crm.mutate({ data: { id: conv.id, labels: labels.filter((x) => x !== item) } })
              }
            >
              {item} ×
            </button>
          ))}
          <Input
            className="h-8 max-w-[180px]"
            placeholder="Nova etiqueta"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const next = label.trim();
              if (!next || labels.includes(next)) return;
              setLabel("");
              crm.mutate({ data: { id: conv.id, labels: [...labels, next] } });
            }}
          />
        </div>
        <div className="space-y-2 rounded-xl border p-3">
          <div className="font-medium">Follow-up</div>
          <p className="text-xs text-muted-foreground">
            Se o cliente não responder, o texto sai na janela de 24 horas. Depois disso, só sai se
            você informar o nome de um modelo aprovado na Meta. A Meta cobra esse modelo na conta da
            agência.
          </p>
          {conv.followUp && (
            <p className="text-xs">
              {conv.followUp.status === "pending"
                ? `Marcado para ${new Date(conv.followUp.dueAt).toLocaleString("pt-BR")}`
                : conv.followUp.detail || conv.followUp.status}
              {conv.crmColumn ? ` · ${columnLabel(conv.crmColumn)}` : ""}
            </p>
          )}
          <Input
            placeholder="Texto se a pessoa não responder"
            value={followText}
            onChange={(e) => setFollowText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-[120px]"
              type="number"
              min={1}
              max={30}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 2)}
            />
            <Input
              className="flex-1 min-w-[160px]"
              placeholder="Modelo aprovado (fora de 24h)"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={follow.isPending || !followText.trim()}
              onClick={() => follow.mutate()}
            >
              Marcar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
