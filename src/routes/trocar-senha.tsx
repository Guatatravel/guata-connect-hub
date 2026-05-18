import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { clearMustChangePassword } from "@/lib/auth/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/trocar-senha")({
  component: TrocarSenhaPage,
});

function TrocarSenhaPage() {
  const { loading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clearFlag = useServerFn(clearMustChangePassword);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  if (!user) {
    navigate({ to: "/login" });
    return null;
  }

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres");
      return;
    }
    if (pw !== pw2) {
      toast.error("As senhas não conferem");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      await clearFlag();
      await qc.invalidateQueries({ queryKey: ["my-profile"] });
      toast.success("Senha atualizada!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao trocar senha");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardContent className="p-8">
          <h1 className="font-display text-2xl font-semibold text-primary mb-2">
            Defina sua nova senha
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Este é seu primeiro acesso. Escolha uma senha pessoal e secreta.
          </p>
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pw">Nova senha</Label>
              <Input
                id="pw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirme a nova senha</Label>
              <Input
                id="pw2"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}