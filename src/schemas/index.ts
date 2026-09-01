import { z } from "zod";
import { ISSUE_TYPES, QUESTION_FIELDS } from "./food-safety-assistant-schema";

export const barcodeSchema = z.string().trim().min(4).max(32).regex(/^\d+$/, "Barcode must be numeric");

export const languageSchema = z.enum(["en", "hi"]).default("en");

export const signupSchema = z.object({
  email: z.string().email("A valid email is required").max(254),
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  language: languageSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required").max(254),
  password: z.string().min(1, "Password is required").max(128),
});

export const nutrientValueSchema = z.object({
  value: z.number().finite(),
  unit: z.string().max(8),
  confidence: z.number().min(0).max(1).optional().default(0.5),
});

export const nutritionInputSchema = z
  .object({
    servingSize: z.string().max(80).optional(),
    servingsPerContainer: z.string().max(40).optional(),
    basis: z.enum(["PER_100G", "PER_SERVING"]).optional().default("PER_100G"),
    nutrients: z.record(z.string().max(40), nutrientValueSchema),
  })
  .optional()
  .nullable();

export const analyzeSchema = z.object({
  barcode: barcodeSchema.optional(),
  productName: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  ingredientsText: z.string().trim().min(1).max(20_000).optional(),
  nutrition: nutritionInputSchema,
  ocrText: z.string().max(20_000).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  userId: z.string().max(100).optional(),
  language: languageSchema,
});

export const ingredientAnalyzeSchema = z.object({
  ingredients: z.array(z.string().trim().min(1).max(300)).min(1, "Provide at least one ingredient").max(200),
  context: z.string().max(200).optional(),
  language: languageSchema,
});

export const personalizedSchema = z.object({
  productId: z.string().min(1).max(120),
  userId: z.string().min(1).max(120).optional(),
});

export const compareSchema = z.object({
  productIds: z.array(z.string().min(1).max(120)).min(2).max(5),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(2000),
  product_id: z.string().trim().min(1).max(64).optional().nullable(),
  conversation_id: z.string().trim().min(1).max(64).optional().nullable(),
  barcode: z.string().trim().min(1).max(32).optional().nullable(),
});

export const historyPostSchema = z.object({
  productId: z.string().min(1).max(120).optional(),
  source: z.enum(["barcode", "label", "manual", "image"]).optional(),
  assessmentSnapshot: z.record(z.string(), z.unknown()),
});

export const profilePatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  language: z.enum(["EN", "HI"]).optional(),
});

export const preferencesPatchSchema = z.object({
  vegetarian: z.boolean().optional(),
  vegan: z.boolean().optional(),
  allergies: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  dietaryRestrictions: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  avoidIngredients: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  preferredIngredients: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  healthGoals: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  sensitivityPreferences: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export const ingredientUpsertSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).min(1).max(80),
  canonicalName: z.string().trim().min(2).max(120),
  insCode: z.string().max(10).optional(),
  eNumber: z.string().max(10).optional(),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2000),
  function: z.string().trim().min(1).max(200),
  assessment: z.enum([
    "beneficial",
    "neutral",
    "generally_accepted",
    "noteworthy",
    "potentially_concerning",
    "allergen",
    "dietary_conflict",
    "insufficient_evidence",
  ]),
  allergenStatus: z.string().max(40).optional(),
  dietaryStatus: z.array(z.string()).max(20).optional(),
  regulatoryStatus: z.enum(["permitted", "restricted", "banned", "under_review", "unknown"]).default("unknown"),
  regulatoryNotes: z.string().max(1000).optional(),
  evidenceLevel: z.enum(["high", "medium", "low", "insufficient"]).default("insufficient"),
  isAdditive: z.boolean().default(false),
  hindiName: z.string().max(120).optional(),
  aliases: z
    .array(
      z.object({
        alias: z.string().trim().min(1).max(120),
        type: z.string().max(20),
      }),
    )
    .max(40)
    .optional(),
});

export const evidenceCreateSchema = z.object({
  ingredientId: z.string().min(1).max(80),
  title: z.string().trim().min(3).max(300),
  organization: z.string().trim().min(1).max(150),
  url: z.string().url().max(500).optional(),
  sourceType: z.enum([
    "government",
    "regulator",
    "scientific_paper",
    "international_standard",
    "academic_database",
    "manufacturer",
    "secondary_source",
  ]),
  publicationDate: z.string().max(20).optional(),
  evidenceLevel: z.enum(["high", "medium", "low"]),
  summary: z.string().trim().min(3).max(2000),
});

export const resolveUnknownSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolvedIngredientId: z.string().min(1).max(80).optional(),
});

// ── Food Safety Assistant schemas ─────────────────────────
// Sized conservatively; this endpoint will be rate-limited per IP.
// All sizes are documented in the type comments.

export const assistantProductSnapshotSchema = z.object({
  id: z.string().max(120).nullish(),
  barcode: z.string().trim().min(4).max(32).nullish(),
  name: z.string().trim().min(1).max(200).nullish(),
  brand: z.string().trim().min(1).max(120).nullish(),
  category: z.string().trim().min(1).max(80).nullish(),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(60).optional(),
  nutritionConcerns: z.array(z.string().max(200)).max(20).optional(),
  allergens: z.array(z.string().max(80)).max(40).optional(),
  regulatorySummary: z.string().max(500).nullish(),
});

export const assistantAnswerValueSchema: z.ZodType<
  string | string[] | boolean | number | null
> = z.union([
  z.string().max(2_000),
  z.array(z.string().max(200)).max(20),
  z.boolean(),
  z.number().finite(),
  z.null(),
]);

export const assistantStateSchema = z
  .object({
    stage: z
      .enum([
        "greeting",
        "selecting_issue",
        "collecting_info",
        "ready_to_generate",
        "reviewing_draft",
        "complete",
      ])
      .optional(),
    productSnapshot: assistantProductSnapshotSchema.nullish(),
    issueType: z.enum(ISSUE_TYPES).nullish(),
    issueConfidence: z.enum(["low", "medium", "high"]).optional(),
    collected: z.record(z.enum(QUESTION_FIELDS), assistantAnswerValueSchema).optional(),
    followUpsAsked: z.array(z.enum(QUESTION_FIELDS)).max(QUESTION_FIELDS.length).optional(),
    skipAnswers: z.array(z.enum(QUESTION_FIELDS)).max(QUESTION_FIELDS.length).optional(),
    language: z.enum(["en", "hi"]).optional(),
  })
  .partial();

export const assistantRequestSchema = z.object({
  action: z.enum(["start", "message", "generate", "reset"]),
  conversationId: z.string().trim().min(1).max(80).nullish(),
  state: assistantStateSchema.nullish(),
  productContext: assistantProductSnapshotSchema.nullish(),
  message: z.string().max(4_000).nullish(),
  answerKey: z.enum(QUESTION_FIELDS).nullish(),
  answerValue: assistantAnswerValueSchema.optional(),
  language: z.enum(["en", "hi"]).optional(),
});

