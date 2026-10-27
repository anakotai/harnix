import { z } from "zod";

/**
 * Version of the JSON assessment report contract.
 *
 * Major: incompatible shape or meaning changes.
 * Minor: additive fields or values. Consumers must ignore unknown fields and
 * tolerate unknown values for extensible string fields.
 */
export const JSON_REPORT_SCHEMA_VERSION = "1.0";
const JSON_REPORT_SCHEMA_MAJOR = JSON_REPORT_SCHEMA_VERSION.split(".")[0]!;
export const JSON_REPORT_SCHEMA_ID = `urn:harnix:json-report:${JSON_REPORT_SCHEMA_MAJOR}`;

const checkResultSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  tier: z.string(),
  score: z.number().min(0).max(1),
  status: z.string(),
  summary: z.string(),
  details: z.string(),
  whyThisMatters: z.string(),
  recommendations: z.array(z.string()),
  references: z.array(z.string())
});

const checkErrorSchema = z.looseObject({
  checkId: z.string(),
  checkName: z.string(),
  message: z.string()
});

const topRecommendationSchema = z.looseObject({
  checkId: z.string(),
  checkName: z.string(),
  targetPath: z.string().nullable(),
  recommendation: z.string(),
  tier: z.string(),
  score: z.number().min(0).max(1)
});

const errorSchema = z.looseObject({
  message: z.string()
});

const childSchema = z.looseObject({
  kind: z.string(),
  path: z.string(),
  status: z.string(),
  get assessment() {
    return assessmentSchema.nullable();
  },
  error: errorSchema.nullable()
});

const assessmentSchema = z.looseObject({
  repoType: z.string().nullable(),
  repoTypeSource: z.string().nullable(),
  detectedRepoType: z.string().nullable(),
  localScore: z.number().min(0).max(1).nullable(),
  localScoreState: z.string(),
  rollupScore: z.number().min(0).max(1).nullable(),
  rollupState: z.string(),
  band: z.string().nullable(),
  evaluatedCheckIds: z.array(z.string()),
  checks: z.array(checkResultSchema),
  checkErrors: z.array(checkErrorSchema),
  get children() {
    return z.array(childSchema);
  }
});

export const jsonReportSchema = z
  .looseObject({
    schemaVersion: z
      .string()
      .regex(
        new RegExp(`^${JSON_REPORT_SCHEMA_MAJOR}\\.\\d+$`),
        "unsupported JSON report schema major version"
      ),
    harnixVersion: z.string().nullable(),
    generatedAt: z.iso.datetime(),
    run: z.looseObject({
      target: z.looseObject({
        path: z.string()
      }),
      options: z.looseObject({
        skip: z.array(z.string()),
        only: z.array(z.string()),
        typeOverride: z.string().nullable(),
        depth: z.number().int().min(0).nullable()
      })
    }),
    assessment: assessmentSchema,
    topRecommendations: z.array(topRecommendationSchema)
  })
  .meta({
    title: "Harnix JSON assessment report",
    description:
      "Versioned machine-readable Harnix assessment. Consumers must ignore unknown fields and tolerate unknown values for extensible string fields such as child kind, check status, repo type source, and score state."
  });

/** Builds the published Draft 2020-12 JSON Schema for the report contract. */
export function buildJsonReportJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(jsonReportSchema, {
    target: "draft-2020-12",
    io: "output"
  }) as Record<string, unknown>;
  const { $schema, ...rest } = generated;
  return { $schema, $id: JSON_REPORT_SCHEMA_ID, ...rest };
}

export type JsonReport = z.infer<typeof jsonReportSchema>;
