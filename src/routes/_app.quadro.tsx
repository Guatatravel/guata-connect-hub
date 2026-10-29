import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/quadro")({
  component: () => <Navigate to="/conversas" replace />,
});
