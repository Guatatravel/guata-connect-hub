import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { registerPartnerSelfService } from "@/lib/access-provision.server";

const registerSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  empresa: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  whatsapp: z.string().trim().min(8).max(30),
  cidade: z.string().trim().max(120).optional(),
  mensagem: z.string().trim().max(1000).optional(),
});

/** Cadastro público — cria conta + agência; liberação operacional fica com admin Guatá. */
export const registerPartnerAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => registerSchema.parse(input))
  .handler(async ({ data }) => {
    return registerPartnerSelfService({
      ...data,
      cidade: data.cidade ?? null,
      mensagem: data.mensagem ?? null,
    });
  });
