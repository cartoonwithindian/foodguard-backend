// Build the evidence checklist from the user's answers and the issue type.
// The checklist is presented in the review step with explicit status
// (provided / not_provided / not_applicable); we never promise that
// the user has evidence they didn't confirm.

import type {
  CollectedInformation,
  EvidenceRequirement,
  EvidenceStatus,
  IssueType,
} from "@/types/food-safety-assistant";

type EvidenceKey =
  | "photos_of_issue"
  | "photos_of_product_label"
  | "purchase_receipt"
  | "kept_product_sample"
  | "doctor_consultation"
  | "witness";

const EVIDENCE_BY_ISSUE: Record<IssueType, EvidenceKey[]> = {
  allergen_undeclared: ["photos_of_issue", "photos_of_product_label", "purchase_receipt", "doctor_consultation"],
  foreign_object: ["photos_of_issue", "photos_of_product_label", "purchase_receipt", "kept_product_sample"],
  spoilage: ["photos_of_issue", "purchase_receipt", "kept_product_sample"],
  mislabeling: ["photos_of_product_label", "purchase_receipt"],
  contamination: ["photos_of_issue", "kept_product_sample"],
  packaging_damage: ["photos_of_issue", "photos_of_product_label", "purchase_receipt"],
  unauthorized_additive: ["photos_of_product_label", "purchase_receipt"],
  fssai_concern: ["photos_of_product_label"],
  other: ["photos_of_product_label"],
};

const EVIDENCE_LABELS: Record<
  EvidenceKey,
  { label: string; description: string; importance: "high" | "medium" | "low" }
> = {
  photos_of_issue: {
    label: "Photos of the issue",
    description: "Clear photos showing the problem (foreign object, mould, damage, etc.)",
    importance: "high",
  },
  photos_of_product_label: {
    label: "Photos of the product label",
    description: "Ingredient list, batch / lot, manufacturing & expiry, FSSAI license",
    importance: "high",
  },
  purchase_receipt: {
    label: "Purchase receipt or order screenshot",
    description: "Helps show date, place and price",
    importance: "medium",
  },
  kept_product_sample: {
    label: "Kept product sample",
    description: "Sealed safely for any potential inspection",
    importance: "medium",
  },
  doctor_consultation: {
    label: "Medical consultation record (only if relevant)",
    description: "Only when a health impact is claimed — keep it high level",
    importance: "low",
  },
  witness: {
    label: "Other witness (optional)",
    description: "Anyone else who saw the issue",
    importance: "low",
  },
};

function statusFor(key: EvidenceKey, collected: CollectedInformation): EvidenceStatus {
  switch (key) {
    case "photos_of_issue":
      return collected.evidence_photos === true
        ? "provided"
        : collected.evidence_photos === false
          ? "not_provided"
          : "not_provided";
    case "photos_of_product_label":
      // Always include — has to do with label not user-collected.
      return "not_provided";
    case "purchase_receipt":
      return collected.evidence_receipt === true
        ? "provided"
        : collected.evidence_receipt === false
          ? "not_provided"
          : "not_provided";
    case "kept_product_sample":
      return collected.evidence_keeping_sample === true
        ? "provided"
        : collected.evidence_keeping_sample === false
          ? "not_provided"
          : collected.consumer_existing_conditions === true /* fallback flag */
            ? "not_applicable"
            : "not_provided";
    case "doctor_consultation":
      return collected.observed_symptoms && collected.observed_symptoms !== "none"
        ? "not_provided"
        : "not_applicable";
    case "witness":
      return "not_provided";
  }
}

export function buildEvidenceChecklist(
  issue: IssueType,
  collected: CollectedInformation,
): EvidenceRequirement[] {
  const keys = EVIDENCE_BY_ISSUE[issue] ?? [];
  return keys.map((key) => {
    const def = EVIDENCE_LABELS[key];
    return {
      key,
      label: def.label,
      description: def.description,
      importance: def.importance,
      status: statusFor(key, collected),
    };
  });
}
