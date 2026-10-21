import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/cotacoes")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
