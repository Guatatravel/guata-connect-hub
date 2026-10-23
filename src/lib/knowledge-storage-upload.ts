import { supabase } from "@/integrations/supabase/client";

export async function uploadFileToKnowledgeBucket(storagePath: string, file: File): Promise<void> {
  const lower = file.name.toLowerCase();
  const contentType =
    file.type ||
    (lower.endsWith(".pdf")
      ? "application/pdf"
      : lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".webp")
          ? "image/webp"
          : "application/octet-stream");

  const { error } = await supabase.storage.from("knowledge").upload(storagePath, file, {
    upsert: true,
    contentType,
  });
  if (error) {
    throw new Error(
      `Upload falhou: ${error.message}. Rode a migration knowledge_bucket_staff_upload no Supabase.`,
    );
  }
}
