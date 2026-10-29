import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/guata/brand-logo";
import { useAuth, signOut } from "@/lib/auth";

export const Route = createFileRoute("/aguardando-liberacao")({
  head: () => ({
    meta: [{ title: "Aguardando liberação — Guatá Channel" }],
  }),
  component: AguardandoLiberacaoPage,
});

function AguardandoLiberacaoPage() {
  const { loading, user } = useAuth();
  const loadGate = useServerFn(fetchPanelAccessGate);
  const { data: gate, isLoading } = useQuery({
    queryKey: ["panel-access-gate"],
    queryFn: () => loadGate(),
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
  });

  if (loading || (user && isLoading)) return null;
  if (!user) return <Navigate to="/login" />;
  if (gate?.accessLiberado) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="flex items-center gap-3 mb-8">
        <BrandLogo className="h-10 w-10 text-xl" />
        <span className="font-display text-xl font-semibold text-primary">Guatá Channel</span>
      </div>
      <Card className="rounded-2xl max-w-lg w-full">
        <CardContent className="p-8 space-y-4 text-center">
          <h1 className="font-display text-2xl font-semibold text-primary">Conta criada</h1>
          <p className="text-muted-foreground text-sm">
            <strong>{gate?.organizationName ?? "Sua agência"}</strong> já está no sistema. A equipe Guatá
            confere o cadastro e libera WhatsApp, IA e conversas em breve.
          </p>
          <p className="text-xs text-muted-foreground">
            Esta página atualiza sozinha. Você também pode falar conosco pelo WhatsApp informado no cadastro.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <Button variant="outline" asChild>
              <Link to="/apresentacao">Voltar ao site</Link>
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut();
                window.location.href = "/login";
              }}
            >
              Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
