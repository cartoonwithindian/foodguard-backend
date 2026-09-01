// Assemble a factual complaint draft from:
//  - product context (barcode, name, brand, FSSAI summary)
//  - user's collected answers (issue summary, dates, evidence)
//  - evidence checklist (rendered with explicit status)
//  - regulatory / ingredient / nutrition context (separate "observations")
//
// Rules:
//  • Always render missing fields as "Not provided".
//  • Never assert a legal violation; request review instead.
//  • Never invent product details. Anything we don't know → "Not provided".
//  • Sensitive fields (doctor notes, etc.) are NOT rendered.
//  • Distinguish "user observations", "FoodGuard observations" and
//    "regulatory context" — they live in different sections of the draft.

import type {
  CollectedInformation,
  ComplaintDraft,
  EvidenceRequirement,
  IssueType,
  ProductSnapshot,
  RegulatoryContext,
} from "@/types/food-safety-assistant";
import { NOT_PROVIDED } from "@/types/food-safety-assistant";

const ISSUE_HEADLINE: Record<IssueType, string> = {
  allergen_undeclared: "Possible undeclared allergen concern",
  foreign_object: "Possible foreign-object contamination",
  spoilage: "Possible spoilage / off-condition product",
  mislabeling: "Possible mislabeling / label discrepancy",
  contamination: "Possible contamination concern",
  packaging_damage: "Damaged or compromised packaging",
  unauthorized_additive: "Possible unauthorized additive concern",
  fssai_concern: "FSSAI / regulatory compliance concern",
  other: "Product safety concern",
};

const REQUEST_PHRASING: Record<IssueType, string> = {
  allergen_undeclared:
    "I am requesting that the relevant authority review the product and the label for a possible undeclared allergen concern.",
  foreign_object:
    "I am requesting that the relevant authority review this product for possible foreign-object contamination and consumer-safety risk.",
  spoilage:
    "I am requesting that the relevant authority review this product for possible quality / spoilage concerns.",
  mislabeling:
    "I am requesting that the relevant authority review the label and product composition for possible mislabeling.",
  contamination:
    "I am requesting that the relevant authority review this product for possible contamination.",
  packaging_damage:
    "I am requesting that the relevant authority review this product's packaging integrity.",
  unauthorized_additive:
    "I am requesting that the relevant authority review the additives / ingredients used in this product.",
  fssai_concern:
    "I am requesting that the relevant authority review the FSSAI / regulatory status of this product.",
  other:
    "I am requesting that the relevant authority review this product for the concern described above.",
};

function safeText(value: string | null | undefined): string {
  if (!value) return NOT_PROVIDED;
  const trimmed = value.trim();
  return trimmed.length === 0 ? NOT_PROVIDED : trimmed;
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // We accept ISO-like strings, mm/yyyy, free-text dates; we do NOT validate
  // because the user is the source of truth — only render what they shared.
  return trimmed.length <= 60 ? trimmed : `${trimmed.slice(0, 60)}…`;
}

function summariseObservations(text: string | null | undefined, fallback: string): string {
  const cleaned = text?.trim();
  if (!cleaned) return fallback;
  return cleaned;
}

export function buildComplaintDraft(input: {
  issue: IssueType;
  product: ProductSnapshot | null;
  collected: CollectedInformation;
  evidence: EvidenceRequirement[];
  regulatory: RegulatoryContext | null;
}): ComplaintDraft {
  const { issue, product, collected, evidence, regulatory } = input;
  const purchaseDate = safeDate(collected.incident_date as string | null);
  const symptoms = safeText(summariseSymptoms(collected.observed_symptoms));
  const headline = ISSUE_HEADLINE[issue];

  const userObservations: string[] = [];
  if (purchaseDate) userObservations.push(`Incident date: ${purchaseDate}.`);
  if (collected.purchase_location) userObservations.push(`Purchase location: ${safeText(collected.purchase_location as string)}.`);
  if (symptoms !== NOT_PROVIDED) userObservations.push(`Health impact reported: ${symptoms}.`);
  if (collected.consumer_age_group) userObservations.push(`Consumer: ${describeAgeGroup(collected.consumer_age_group as string)}.`);
  if (collected.product_batch) userObservations.push(`Batch / lot: ${safeText(collected.product_batch as string)}.`);
  if (collected.product_manufacturing_date) userObservations.push(`Manufacturing date: ${safeText(collected.product_manufacturing_date as string)}.`);
  if (collected.product_expiry_date) userObservations.push(`Expiry / best-before: ${safeText(collected.product_expiry_date as string)}.`);
  if (collected.anything_else) userObservations.push(`Additional notes: ${summariseObservations(collected.anything_else as string, "")}`.trim());

  const foodguardObservations: string[] = [];
  if (product?.name) foodguardObservations.push(`Product name: ${safeText(product.name)}.`);
  if (product?.brand) foodguardObservations.push(`Brand: ${safeText(product.brand)}.`);
  if (product?.ingredients && product.ingredients.length > 0) {
    foodguardObservations.push(`Ingredients on label (${product.ingredients.length}): ${product.ingredients.slice(0, 8).join(", ")}${product.ingredients.length > 8 ? "…" : ""}.`);
  } else {
    foodguardObservations.push("Ingredient list on label was not identified by FoodGuard.");
  }
  if (product?.nutritionConcerns && product.nutritionConcerns.length > 0) {
    foodguardObservations.push(`Nutrition-related observations: ${product.nutritionConcerns.join("; ")}.`);
  }
  if (regulatory?.ingredients && regulatory.ingredients.length > 0) {
    const concerning = regulatory.ingredients.filter((i) => /concern|allergen|restricted|unauthor/i.test(i.assessment));
    if (concerning.length > 0) {
      foodguardObservations.push(
        `FoodGuard flagged ${concerning.length} ingredient(s) for review: ${concerning.slice(0, 3).map((i) => `${i.name} (${i.assessment})`).join("; ")}.`,
      );
    }
  }

  const regulatoryContextLines: string[] = [];
  if (regulatory?.fssai) {
    regulatoryContextLines.push(`FSSAI summary: ${safeText(regulatory.fssai.summary)}.`);
    if (regulatory.fssai.findings.length > 0) {
      for (const f of regulatory.fssai.findings.slice(0, 4)) {
        regulatoryContextLines.push(`- ${f.type}: ${f.details}`);
      }
    }
  } else {
    regulatoryContextLines.push("FSSAI context was not available at the time of this draft.");
  }
  if (regulatory?.country) {
    regulatoryContextLines.push(`Country of origin / marking: ${safeText(regulatory.country)}.`);
  }

  const issueSummaryParts: string[] = [`Concern: ${headline}.`];
  if (symptoms !== NOT_PROVIDED) issueSummaryParts.push(`Reported health impact: ${symptoms}.`);
  if (collected.purchase_location) issueSummaryParts.push(`Purchase context: ${safeText(collected.purchase_location as string)}.`);
  const issueSummary = issueSummaryParts.join(" ");

  const request = REQUEST_PHRASING[issue];

  const subjectLineParts: string[] = [headline];
  if (product?.brand) subjectLineParts.push(`brand ${safeText(product.brand)}`);
  if (product?.name) subjectLineParts.push(`(${safeText(product.name)})`);
  subjectLineParts.push("— request for review");
  const subjectLine = subjectLineParts.join(" ");

  const greeting = "To the Concerned Authority,";
  const closing = "Sincerely,\n[Your name]";

  const disclaimer =
    "This draft is informational. It expresses the user's observations and the analysis produced by FoodGuard, " +
    "and does not assert any legal conclusion or regulatory violation. The relevant authority is best placed to " +
    "determine the actual compliance status.";

  return {
    subjectLine,
    greeting,
    productDetails: {
      productName: product?.name ?? null,
      brand: product?.brand ?? null,
      barcode: product?.barcode ?? null,
      batchOrLot: safeText(collected.product_batch as string) === NOT_PROVIDED ? null : (collected.product_batch as string | null),
      manufacturingDate: safeDate(collected.product_manufacturing_date as string | null),
      expiryDate: safeDate(collected.product_expiry_date as string | null),
      mrp: null,
      netWeight: null,
    },
    purchaseDetails: {
      purchaseDate: purchaseDate,
      purchaseLocation: safeText(collected.purchase_location as string) === NOT_PROVIDED ? null : (collected.purchase_location as string | null),
      purchaseReceipt: collected.evidence_receipt === true ? "Provided" : "Not provided",
    },
    consumerDetails: {
      isConsumerProvided: Boolean(collected.consumer_age_group),
      ageGroup: safeText(collected.consumer_age_group as string) === NOT_PROVIDED ? null : (collected.consumer_age_group as string | null),
    },
    issueSummary,
    observations: {
      userObservations: userObservations.length > 0 ? userObservations : ["No additional user observations were provided."],
      foodguardObservations: foodguardObservations.length > 0 ? foodguardObservations : ["FoodGuard context could not be summarised."],
      regulatoryContext: regulatoryContextLines,
    },
    evidenceChecklist: evidence,
    request,
    closing,
    disclaimer,
  };
}

function summariseSymptoms(value: CollectedInformation["observed_symptoms"]): string {
  if (!value) return NOT_PROVIDED;
  if (Array.isArray(value)) {
    const list = value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
    return list.length === 0 ? NOT_PROVIDED : list.join(", ");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return NOT_PROVIDED;
    // Predefined values are kept terse.
    switch (trimmed.toLowerCase()) {
      case "none":
        return "No symptoms";
      case "mild":
        return "Mild discomfort";
      case "moderate":
        return "Moderate reaction";
      case "severe":
        return "Severe reaction";
      case "unsure":
        return "Symptoms uncertain";
      default:
        return trimmed;
    }
  }
  return NOT_PROVIDED;
}

function describeAgeGroup(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return NOT_PROVIDED;
  const lower = trimmed.toLowerCase();
  if (lower === "child") return "Child";
  if (lower === "adult") return "Adult";
  if (lower === "elderly") return "Elderly";
  if (lower === "mix") return "Multiple people";
  if (lower === "na") return "Prefers not to say";
  return trimmed;
}
