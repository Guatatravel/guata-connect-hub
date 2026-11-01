import { createFileRoute } from "@tanstack/react-router";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const q = new URL(request.url).searchParams.get("secret");
  return q === secret;
}

export const Route = createFileRoute("/api/public/cron/resume-handoffs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorizeCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { resumeStaleHandoffsForAllOrganizations } = await import(
          "@/lib/handoff-resume.server"
        );
        await resumeStaleHandoffsForAllOrganizations();
        return Response.json({ ok: true });
      },
      POST: async ({ request }) => {
        if (!authorizeCron(request)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { resumeStaleHandoffsForAllOrganizations } = await import(
          "@/lib/handoff-resume.server"
        );
        await resumeStaleHandoffsForAllOrganizations();
        return Response.json({ ok: true });
      },
    },
  },
});
