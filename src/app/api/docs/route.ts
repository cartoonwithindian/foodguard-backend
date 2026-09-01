import { jsonSuccess } from "@/lib/http";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/**
 * GET /api/docs
 * OpenAPI 3.0 JSON describing the public API surface.
 */
export async function GET() {
  const data = {
    openapi: "3.0.3",
    info: {
      title: "FoodGaurd AI API",
      version: "0.2.0",
      description:
        "Evidence-backed food product analysis. SCAN -> UNDERSTAND -> VERIFY -> COMPARE -> DECIDE. Informational only; never medical advice.",
      contact: { name: "FoodGaurd AI" },
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "Analysis", description: "Core analysis pipelines" },
      { name: "Products", description: "Product lookup, search, compare, alternatives" },
      { name: "Ingredients", description: "Ingredient knowledge base" },
      { name: "Nutrition", description: "Nutrition facts" },
      { name: "Evidence", description: "Evidence and citations" },
      { name: "Personalization", description: "User preference layer" },
      { name: "History", description: "Scan history" },
      { name: "Users", description: "Profiles and preferences" },
      { name: "Auth", description: "Signup / login / session" },
      { name: "Admin", description: "Moderation and curation" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      responses: {
        EnvelopeError: {
          description: "Error response envelope",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  data: { type: "null" },
                  error: {
                    type: "object",
                    properties: {
                      code: { type: "string", example: "PRODUCT_NOT_FOUND" },
                      message: { type: "string", example: "Product could not be found" },
                    },
                  },
                  meta: { type: "object", nullable: true },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/analyze": {
        post: {
          tags: ["Analysis"],
          summary: "End-to-end analysis pipeline",
          description:
            "Accepts a barcode and/or ingredients text and/or nutrition; runs the full deterministic pipeline (product lookup, ingredient parsing/normalization, allergen detection, nutrition analysis, evidence lookup, scoring, personalization, alternatives) and returns a frontend-compatible result. Always includes provenance in meta.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    barcode: { type: "string", example: "8901000000001" },
                    productName: { type: "string", example: "Crunchy Masala Snack" },
                    brand: { type: "string" },
                    ingredientsText: { type: "string", example: "Corn Flour, Palm Oil, Salt, INS 621" },
                    nutrition: {
                      type: "object",
                      description: "Nutrition facts if known",
                      nullable: true,
                    },
                    ocrText: { type: "string", description: "Raw OCR text if scanned" },
                    ocrConfidence: { type: "number", minimum: 0, maximum: 1 },
                    language: { type: "string", enum: ["en", "hi"], default: "en" },
                    userId: { type: "string", description: "Optional user id for personalization" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Analysis result + meta" },
            "404": { $ref: "#/components/responses/EnvelopeError" },
            "422": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/scan/label": {
        post: {
          tags: ["Analysis"],
          summary: "OCR label scan",
          description:
            "Multipart upload of a label image. Returns extracted sections, raw text and confidence. Low confidence or missing text sets needsReview=true.",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    image: { type: "string", format: "binary" },
                    barcode: { type: "string" },
                    productName: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "rawText, ingredientsText, nutritionText, ingredients, nutrition, confidence, needsReview",
            },
            "422": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/products/barcode/{barcode}": {
        get: {
          tags: ["Products"],
          summary: "Lookup a product by barcode",
          description:
            "Barcode lookup with a strict fallback chain: foodguard (India DB -> demo store -> Open Food Facts) -> google -> barcode-list -> barcodesdatabase -> barcodespider -> OCR+google. Returns product, nutrition, source, confidence and mergedFrom (secondary sources that filled missing fields). Unknown barcodes return 404 with error PRODUCT_NOT_FOUND instead of fabricating data.",
          parameters: [{ name: "barcode", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "product, nutrition, source, confidence, mergedFrom" },
            "404": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/products/search": {
        get: {
          tags: ["Products"],
          summary: "Search products",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string", enum: ["food", "cosmetics", "personal_care", "household", "other", "all"], default: "all" } },
          ],
          responses: { "200": { description: "products, total" } },
        },
      },
      "/api/products/compare": {
        post: {
          tags: ["Products"],
          summary: "Compare 2-5 products",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productIds"],
                  properties: {
                    productIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "products with side-by-side data and whyBetter" } },
        },
      },
      "/api/products/{id}/alternatives": {
        get: {
          tags: ["Products"],
          summary: "Objective alternative ranking",
          description: "Similarity + measurable improvement only. Never commercial.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "product, alternatives" } },
        },
      },
      "/api/ingredients/analyze": {
        post: {
          tags: ["Ingredients"],
          summary: "Analyze a list of ingredients",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ingredients"],
                  properties: {
                    ingredients: { type: "array", items: { type: "string" }, example: ["potato", "palm oil", "salt", "INS 621"] },
                    context: { type: "string" },
                    language: { type: "string", enum: ["en", "hi"], default: "en" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "ingredients, unknownIngredients, matchRate, unresolvedCount" } },
        },
      },
      "/api/ingredients/{id}": {
        get: {
          tags: ["Ingredients"],
          summary: "Ingredient knowledge-base detail",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "IngredientDetail-compatible payload" },
            "404": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/nutrition/{barcode}": {
        get: {
          tags: ["Nutrition"],
          summary: "Nutrition facts for a product",
          parameters: [{ name: "barcode", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "NutritionProductDetail-compatible payload" } },
        },
      },
      "/api/evidence/{barcode}": {
        get: {
          tags: ["Evidence"],
          summary: "Evidence for a product",
          parameters: [{ name: "barcode", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "EvidencePageData-compatible payload" } },
        },
      },
      "/api/analysis/personalized": {
        post: {
          tags: ["Personalization"],
          security: [{ bearerAuth: [] }],
          summary: "Personalize an analysis for the authenticated user",
          description: "Adds preference flags on top of objective facts. Never alters the objective analysis.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productId"],
                  properties: { productId: { type: "string" } },
                },
              },
            },
          },
          responses: { "200": { description: "personalizedFlags, compatible, summary" } },
        },
      },
      "/api/history": {
        get: {
          tags: ["History"],
          security: [{ bearerAuth: [] }],
          summary: "List scan history",
          responses: { "200": { description: "history, total" } },
        },
        post: {
          tags: ["History"],
          security: [{ bearerAuth: [] }],
          summary: "Save a scan/analysis",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["productId"],
                  properties: {
                    productId: { type: "string" },
                    source: { type: "string", enum: ["barcode", "label", "manual"] },
                    assessmentSnapshot: { type: "object", description: "Frontend AnalysisResult snapshot" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "entry" } },
        },
      },
      "/api/users/me": {
        get: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Current user profile",
          responses: { "200": { description: "user" } },
        },
        patch: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Update name / language",
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { name: { type: "string" }, language: { type: "string", enum: ["en", "hi"] } } },
              },
            },
          },
          responses: { "200": { description: "user" } },
        },
      },
      "/api/users/me/preferences": {
        patch: {
          tags: ["Users"],
          security: [{ bearerAuth: [] }],
          summary: "Update dietary / allergy preferences",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dietType: { type: "string", enum: ["vegetarian", "vegan", "eggetarian", "none"] },
                    allergies: { type: "array", items: { type: "string" } },
                    avoidIngredients: { type: "array", items: { type: "string" } },
                    avoidNonVeg: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "preferences" } },
        },
      },
      "/api/auth/signup": {
        post: {
          tags: ["Auth"],
          summary: "Create an account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "name", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    name: { type: "string" },
                    password: { type: "string", minLength: 8 },
                    language: { type: "string", enum: ["en", "hi"], default: "en" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "token, user" },
            "409": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Log in",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "token, user" },
            "401": { $ref: "#/components/responses/EnvelopeError" },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          summary: "Validate session",
          responses: { "200": { description: "user" } },
        },
      },
      "/api/admin/dashboard": {
        get: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Admin stats",
          responses: { "200": { description: "stats" } },
        },
      },
      "/api/admin/ingredients": {
        get: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "List knowledge base",
          responses: { "200": { description: "ingredients, total" } },
        },
        post: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Add / update an ingredient record",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["id", "canonicalName", "category", "description", "function", "assessment", "evidenceLevel", "isAdditive", "dietaryStatus", "regulatoryStatus"],
                  properties: {
                    id: { type: "string" },
                    canonicalName: { type: "string" },
                    aliases: { type: "array", items: { type: "string" } },
                    insCode: { type: "string" },
                    eNumber: { type: "string" },
                    hindiName: { type: "string" },
                    category: { type: "string" },
                    description: { type: "string" },
                    function: { type: "string" },
                    assessment: { type: "string", enum: ["generally_accepted", "acceptable_limits", "noteworthy", "potentially_concerning", "avoid", "insufficient_evidence"] },
                    allergenStatus: { type: "string" },
                    dietaryStatus: { type: "array", items: { type: "string" } },
                    regulatoryStatus: { type: "string", enum: ["permitted", "restricted", "prohibited", "reviewed_limited"] },
                    regulatoryNotes: { type: "string" },
                    evidenceLevel: { type: "string", enum: ["high", "medium", "low"] },
                    isAdditive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/api/admin/evidence": {
        post: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Attach evidence to an ingredient",
          responses: { "200": { description: "ok" } },
        },
      },
      "/api/admin/reviews": {
        get: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Unknown-ingredient review queue",
          responses: { "200": { description: "queue, total" } },
        },
      },
      "/api/admin/reviews/{id}/resolve": {
        post: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "Resolve or dismiss a review item",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: {
                    status: { type: "string", enum: ["resolved", "dismissed"] },
                    resolvedIngredientId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/api/admin/products": {
        get: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "List products",
          responses: { "200": { description: "products, total" } },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["Admin"],
          security: [{ bearerAuth: [] }],
          summary: "List users",
          responses: { "200": { description: "users, total" } },
        },
      },
    },
  };

  return jsonSuccess(
    data,
    {
      requestId: "docs",
      env: config.ai.provider === "mock" && config.ocr.provider === "mock" ? "mock" : "configured",
      description: "Informational API. Never medical advice. Demo mode: " + (config.seed.enabled ? "on" : "off"),
    },
  );
}
