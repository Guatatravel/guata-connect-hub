import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/respostas")({
  component: () => <Navigate to="/configuracoes" replace />,
});
