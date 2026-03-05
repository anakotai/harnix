import { z } from "zod";

export const configSchema = z.object({
  output: z.string().min(1).optional(),
  skip: z.array(z.string().min(1)).optional(),
  only: z.array(z.string().min(1)).optional(),
  type: z.enum(["software", "non-software"]).optional(),
}).refine(
  (data) => !(data.skip && data.skip.length > 0 && data.only && data.only.length > 0),
  { message: "skip and only cannot be used together" }
);

export type HarnixConfig = z.infer<typeof configSchema>;
