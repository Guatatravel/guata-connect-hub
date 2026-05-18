import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  bootstrapFirstAdmin,
  checkAdminExists,
} from "@/lib/auth/admin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const [exists, setExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const check = useServerFn(checkAdminExists);
  const bootstrap = useServerFn(bootstrapFirstAdmin);

  useEffect(() => {
    check().then((r) => setExists(r.exists)).catch(() => setExists(null));
  }, [check]);

  const run = async () => {
    setLoading(true);
    try {
      const r = await bootstrap();
      setResult(r);
      toast.success("Administrador criado!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-lg">
        <CardContent className="p-8 space-y-4">
          <h1 className="font-display text-2xl font-semibold text-primary">
            Configurar administrador
          </h1>

          {exists === true && !result && (
            <>
              <p className="text-sm text-muted-foreground">
                Já existe um administrador no sistema. Volte para o login.
              </p>
              <Link to="/login" className="text-primary underline">
                Ir para login
              </Link>
            </>
          )}

          {exists === false && !result && (
            <>
              <p className="text-sm text-muted-foreground">
                Vamos criar a conta de administrador inicial com o email{" "}
                <strong>guilhermearevalo27@gmail.com</strong>. Uma senha
                temporária será gerada agora e exibida apenas uma vez nesta
                tela. Guarde-a em local seguro.
              </p>
              <Button onClick={run} disabled={loading} className="w-full">
                {loading ? "Criando..." : "Criar administrador"}
              </Button>
            </>
          )}

          {result && (
            <div className="space-y-3">
              <p className="text-sm">Conta criada com sucesso:</p>
              <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2">
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-mono text-sm">{result.email}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Senha temporária
                  </div>
                  <div className="font-mono text-sm select-all break-all">
                    {result.tempPassword}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Faça login com esta senha. No primeiro acesso o sistema vai
                pedir para você definir uma nova.
              </p>
              <Link to="/login" className="inline-block">
                <Button className="w-full">Ir para login</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}