import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askCopilot } from "@/lib/copilot.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Compass, Send } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

function extractSuggestion(text: string) {
  const i = text.indexOf("MENSAGEM:");
  return i >= 0 ? text.slice(i + 9).trim() : null;
}

export function CopilotCard({
  sessionId,
  onUseMessage,
}: {
  sessionId: string;
  onUseMessage: (t: string) => void;
}) {
  const ask = useServerFn(askCopilot);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");

  const mut = useMutation({
    mutationFn: async (next: Msg[]) => (await ask({ data: { sessionId, history: next } })).answer,
    onSuccess: (answer, next) => setHistory([...next, { role: "assistant", content: answer }]),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no Copiloto"),
  });

  const send = () => {
    const t = input.trim();
    if (!t || mut.isPending) return;
    const next = [...history, { role: "user" as const, content: t }].slice(-20);
    setHistory(next);
    setInput("");
    mut.mutate(next);
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Compass className="h-4 w-4 text-accent" /> Copiloto IA
          <span className="text-xs font-normal text-muted-foreground">
            (só você vê — o cliente não recebe)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-80 overflow-y-auto space-y-3">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Pergunte, por exemplo: “O que o cliente quer?”, “Traduza a última mensagem” ou
              “Escreva uma resposta em inglês oferecendo um roteiro em Bonito”.
            </p>
          )}
          {history.map((m, i) => {
            const sug = m.role === "assistant" ? extractSuggestion(m.content) : null;
            return (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-xl bg-primary text-primary-foreground px-3 py-2 text-sm"
                    : "max-w-[95%] text-sm whitespace-pre-wrap"
                }
              >
                {m.content}
                {sug && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => onUseMessage(sug)}>
                    Usar como resposta
                  </Button>
                )}
              </div>
            );
          })}
          {mut.isPending && <p className="text-sm text-muted-foreground">Pensando…</p>}
        </div>
        <div className="flex gap-2">
          <Textarea
            rows={2}
            value={input}
            placeholder="Converse com a IA sobre este cliente..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button onClick={send} disabled={mut.isPending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
