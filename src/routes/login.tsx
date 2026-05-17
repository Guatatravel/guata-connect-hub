import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Informe email e senha");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    signIn(email);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-3 mb-6">
            <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center text-3xl shadow-sm">
              🦫
            </div>
            <div className="text-center">
              <h1 className="font-display text-2xl font-semibold text-primary">
                Guatá Channel
              </h1>
              <p className="text-sm text-muted-foreground">
                Painel operacional WhatsApp
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="consultor@guata.app"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Login mock — qualquer credencial funciona nesta versão.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}