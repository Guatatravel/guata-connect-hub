import { useQuery } from "@tanstack/react-query";
import { fetchLogoUrl } from "@/lib/branding.functions";
import { cn } from "@/lib/utils";

export const logoQueryKey = ["branding-logo"] as const;

export function useLogoUrl() {
  return useQuery({
    queryKey: logoQueryKey,
    queryFn: async () => (await fetchLogoUrl()).url,
    staleTime: 5 * 60 * 1000,
  });
}

export function BrandLogo({
  className,
  fallbackClassName,
}: {
  className?: string;
  fallbackClassName?: string;
}) {
  const { data: url, isPending } = useLogoUrl();
  if (isPending) {
    // Espaço neutro enquanto carrega — evita o "pisca" emoji → logo
    return <div className={cn("rounded-full bg-muted", className)} aria-hidden />;
  }
  if (url) {
    return (
      <img
        src={url}
        alt="Logo do portal"
        className={cn("object-contain rounded-full bg-card", className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-accent flex items-center justify-center shadow-sm",
        className,
        fallbackClassName,
      )}
    >
      🦫
    </div>
  );
}
