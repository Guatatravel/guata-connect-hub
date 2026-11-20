import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scheduleFollowUp } from "@/lib/crm.functions";
import type { Conversation } from "@/types/guata";

export function CrmPanel({ conv }: { conv: Conversation }) {
  const qc = useQueryClient();
  const schedule = useServerFn(scheduleFollowUp);
  const [days, setDays] = useState(2);
  const [followText, setFollowText] = useState(conv.followUp?.text ?? "");
  const [templateName, setTemplateName] = useState(conv.followUp?.templateName ?? "");

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

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-display">Follow-up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Se o cliente não responder, o texto sai na janela de 24 horas. Depois disso, só sai se você
          informar o nome de um modelo aprovado na Meta.
        </p>
        {conv.followUp && (
          <p className="text-xs">
            {conv.followUp.status === "pending"
              ? `Marcado para ${new Date(conv.followUp.dueAt).toLocaleString("pt-BR")}`
              : conv.followUp.detail || conv.followUp.status}
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
      </CardContent>
    </Card>
  );
}