import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cancelFollowUpFn, scheduleFollowUp } from "@/lib/crm.functions";
import { listWhatsappTemplatesFn } from "@/lib/whatsapp-templates.functions";
import type { FollowUpDelayUnit, FollowUpStep } from "@/lib/crm.shared";
import type { Conversation } from "@/types/guata";

type DraftStep = FollowUpStep;

function emptyStep(): DraftStep {
  return { delay: 2, unit: "days", text: "", templateName: undefined };
}

export function CrmPanel({ conv }: { conv: Conversation }) {
  const qc = useQueryClient();
  const schedule = useServerFn(scheduleFollowUp);
  const cancelFn = useServerFn(cancelFollowUpFn);
  const listTemplates = useServerFn(listWhatsappTemplatesFn);

  const initialSteps: DraftStep[] = useMemo(() => {
    if (conv.followUp?.steps?.length) {
      return conv.followUp.steps.map((s) => ({
        delay: s.delay,
        unit: s.unit,
        text: s.text,
        templateName: s.templateName,
      }));
    }
    if (conv.followUp?.text) {
      return [
        {
          delay: 2,
          unit: "days" as FollowUpDelayUnit,
          text: conv.followUp.text,
          templateName: conv.followUp.templateName,
        },
      ];
    }
    return [emptyStep()];
  }, [conv.followUp]);

  const [steps, setSteps] = useState<DraftStep[]>(initialSteps);

  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates-followup"],
    queryFn: async () => {
      try {
        return await listTemplates();
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });
  const approved = (templates ?? []).filter(
    (t) => String(t.status ?? "").toUpperCase() === "APPROVED",
  );

  const follow = useMutation({
    mutationFn: () =>
      schedule({
        data: {
          id: conv.id,
          steps: steps.map((s) => ({
            delay: s.delay,
            unit: s.unit,
            text: s.text.trim(),
            templateName: s.templateName?.trim() || undefined,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Follow-up agendado");
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: conv.id } }),
    onSuccess: () => {
      toast.success("Follow-up cancelado");
      qc.invalidateQueries({ queryKey: ["conversation", conv.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const canSave = steps.length > 0 && steps.every((s) => s.text.trim().length > 0);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-display">Follow-up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Se o cliente não responder, o sistema envia as etapas na ordem. Dentro de 24h: texto
          livre. Fora da janela: só sai se a etapa tiver modelo Meta aprovado. Se o cliente
          responder, cancela o ciclo.
        </p>

        {conv.followUp && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 space-y-1 text-xs">
            <div>
              Status:{" "}
              <span className="font-medium">
                {conv.followUp.status === "pending"
                  ? `agendado · etapa ${(conv.followUp.stepIndex ?? 0) + 1}${
                      conv.followUp.steps?.length ? `/${conv.followUp.steps.length}` : ""
                    } · ${new Date(conv.followUp.dueAt).toLocaleString("pt-BR")}`
                  : conv.followUp.detail || conv.followUp.status}
              </span>
            </div>
            {(conv.followUp.history?.length ?? 0) > 0 && (
              <ul className="text-muted-foreground space-y-0.5 max-h-24 overflow-auto">
                {conv.followUp.history!.slice(-5).map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    Etapa {h.stepIndex + 1}: {h.status}
                    {h.detail ? ` — ${h.detail}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {(conv.followUp.status === "pending" || conv.followUp.status === "paused") && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancelar follow-up
              </Button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="rounded-xl border p-3 space-y-2 bg-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-primary">Etapa {index + 1}</span>
                {steps.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="w-20"
                  type="number"
                  min={1}
                  value={step.delay}
                  onChange={(e) =>
                    updateStep(index, { delay: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
                <Select
                  value={step.unit}
                  onValueChange={(v) => updateStep(index, { unit: v as FollowUpDelayUnit })}
                >
                  <SelectTrigger className="w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">minutos</SelectItem>
                    <SelectItem value="hours">horas</SelectItem>
                    <SelectItem value="days">dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                rows={2}
                placeholder="Mensagem se a pessoa não responder"
                value={step.text}
                onChange={(e) => updateStep(index, { text: e.target.value })}
              />
              {step.text.trim() && (
                <p className="text-[11px] text-muted-foreground border-l-2 border-primary/40 pl-2 whitespace-pre-wrap">
                  Prévia: {step.text.trim().slice(0, 200)}
                  {step.text.trim().length > 200 ? "…" : ""}
                </p>
              )}
              {approved.length > 0 ? (
                <Select
                  value={step.templateName || "__none__"}
                  onValueChange={(v) =>
                    updateStep(index, { templateName: v === "__none__" ? undefined : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Modelo Meta (fora de 24h)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem modelo (só na janela 24h)</SelectItem>
                    {approved.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Modelo Meta aprovado (fora de 24h, opcional)"
                  value={step.templateName ?? ""}
                  onChange={(e) => updateStep(index, { templateName: e.target.value || undefined })}
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {steps.length < 3 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSteps((prev) => [...prev, emptyStep()])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Nova etapa
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={follow.isPending || !canSave}
            onClick={() => follow.mutate()}
          >
            Agendar follow-up
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
