import { createFileRoute } from "@tanstack/react-router";
import { Navigate } from "@tanstack/react-router";
import { getSession } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const session = getSession();
  return <Navigate to={session ? "/dashboard" : "/login"} />;
}
