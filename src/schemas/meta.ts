import { z } from "zod";

const kebabCase = z.string().regex(
  /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  "must be kebab-case (lowercase letters, digits, and hyphens)"
);

export const metaSchema = z.object({
  id: kebabCase,
  name: z.string().min(1),
  category: z.string().min(1),
  tier: z.enum(["critical", "important", "nice-to-have"]),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)),
  applicableTo: z.enum(["all", "software", "non-software"]),
});

export type CheckMeta = z.infer<typeof metaSchema>;
