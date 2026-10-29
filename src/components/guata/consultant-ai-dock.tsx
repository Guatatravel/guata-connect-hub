import { Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DossieCard } from "@/components/guata/dossie-card";
import { CopilotCard } from "@/components/guata/copilot-card";

export function ConsultantAiDock({
  sessionId,
  onUseMessage,
}: {
  sessionId: string;
  onUseMessage?: (text: string) => void;
}) {
  const useMessage = (text: string) => {
    onUseMessage?.(text);
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Compass className="h-4 w-4 text-accent" /> IA do consultor
          <span className="text-xs font-normal text-muted-foreground">
            Dossiê e copiloto. Só você vê.
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="resumo">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="perguntar">Perguntar</TabsTrigger>
          </TabsList>
          <TabsContent value="resumo" className="mt-3">
            <DossieCard sessionId={sessionId} onUseMessage={onUseMessage ? useMessage : undefined} embedded />
          </TabsContent>
          <TabsContent value="perguntar" className="mt-3 flex max-h-[28rem] flex-col">
            <CopilotCard sessionId={sessionId} onUseMessage={useMessage} embedded />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
