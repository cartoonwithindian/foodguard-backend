// Conservative issue classification + sensitive-data redaction helpers.
// Pure functions — no side effects, no network.

import type { IssueType, QuestionField } from "@/types/food-safety-assistant";

// Conservative keyword mapping. We only classify at the user's request
// (chips) or when their first message contains an unambiguous keyword.
const KEYWORD_TO_ISSUE: Array<{ pattern: RegExp; type: IssueType; weight: number }> = [
  // Allergen / labelling
  { pattern: /\b(allerg|allergen|allergic reaction|i had a reaction|rash|hives|swelled|swollen lips|breath)\b/i, type: "allergen_undeclared", weight: 3 },
  { pattern: /\b(undeclared allergen|contains [a-z]+ but label|not declared|mislabel).{0,80}(allergen|ingredient)/i, type: "allergen_undeclared", weight: 2 },
  // Foreign object / contamination
  { pattern: /\b(foreign object|metal|plastic piece|hair|fingernail|insect|bug|worm|stone|glass|piece of)\b/i, type: "foreign_object", weight: 3 },
  { pattern: /\b(contamination|contaminated)\b/i, type: "contamination", weight: 2 },
  // Spoilage
  { pattern: /\b(smells bad|foul smell|rotten|spoiled|spoilage|mould|mold|sour|expired before|off smell|taste[ds]? off)\b/i, type: "spoilage", weight: 3 },
  // Mislabeling / claim
  { pattern: /\b(mislabel|wrong ingredient|w(?:as|asn|erent)[ -]+on (?:the )?label|label says .{0,40} but\b)/i, type: "mislabeling", weight: 2 },
  { pattern: /\b(fake|fraudulent|counterfe)\b/i, type: "mislabeling", weight: 1 },
  // Packaging
  { pattern: /\b(packag[ei]ng|packet|can|sealed).{0,80}(damage|leak|burst|open|broken|swell(?:en|ed|id)|tampered)/i, type: "packaging_damage", weight: 3 },
  // Additives
  { pattern: /\b(additive|preservative|color|colour).{0,60}(not (allowed|permitted)|banned|illegal)/i, type: "unauthorized_additive", weight: 3 },
  { pattern: /\b(fssai|licen[cs]e number|food safety)\b/i, type: "fssai_concern", weight: 2 },
];

export type ClassifyResult = {
  type: IssueType;
  confidence: "low" | "medium" | "high";
  matchedKeywords: string[];
};

export function classifyIssue(text: string | null | undefined): ClassifyResult {
  if (!text || !text.trim()) {
    return { type: "other", confidence: "low", matchedKeywords: [] };
  }
  const counts = new Map<IssueType, { score: number; keywords: string[] }>();
  for (const { pattern, type, weight } of KEYWORD_TO_ISSUE) {
    const matches = text.match(pattern);
    if (!matches) continue;
    const entry = counts.get(type) ?? { score: 0, keywords: [] };
    entry.score += weight;
    for (const m of matches) {
      // Avoid storing very long matches; truncate to keep logs sane.
      const v = m.length > 60 ? `${m.slice(0, 60)}…` : m;
      if (!entry.keywords.includes(v)) entry.keywords.push(v);
    }
    counts.set(type, entry);
  }
  if (counts.size === 0) {
    return { type: "other", confidence: "low", matchedKeywords: [] };
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1].score - a[1].score);
  const [topType, topStats] = sorted[0]!;
  const confidence: "low" | "medium" | "high" =
    topStats.score >= 4 ? "high" : topStats.score >= 2 ? "medium" : "low";
  return { type: topType, confidence, matchedKeywords: topStats.keywords.slice(0, 4) };
}

// ── Sensitive-data redaction ─────────────────────────────────
// We never echo raw emails, phone numbers, OTP codes, Aadhaar/PAN
// numbers or URLs containing them back in assistant messages or in the
// draft. Apply to free-text user messages and to any assistant output
// that came from the LLM — defence in depth.

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Aadhaar must be checked BEFORE phone so that 12-digit ID numbers
// don't get caught by the more permissive phone regex.
const AADHAAR_PATTERN = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PHONE_PATTERN = /(?<!\d)(?:\+?\d{1,3}[\s-]?)?\d{10,13}\b/g;
const URL_PATTERN = /\bhttps?:\/\/\S+/gi;
const LONG_DIGIT_BLOCK = /\b\d{12,}\b/g;
const OTP_PATTERN = /\b(?:otp|one[- ]?time[- ]?password)[:\s]*\d{4,8}\b/gi;

type RedactionResult = { redacted: string; removed: number };

function applyPatterns(input: string, patterns: RegExp[], mask: string): RedactionResult {
  let removed = 0;
  let output = input;
  for (const p of patterns) {
    // Reset lastIndex state if pattern has /g flag (we always pass /g).
    p.lastIndex = 0;
    output = output.replace(p, () => {
      removed += 1;
      return mask;
    });
  }
  return { redacted: output, removed };
}

export function redactSensitive(input: string): { redacted: string; removed: number } {
  if (!input) return { redacted: input, removed: 0 };
  const emailResult = applyPatterns(input, [EMAIL_PATTERN], "[redacted-email]");
  const aadhaarResult = applyPatterns(emailResult.redacted, [AADHAAR_PATTERN], "[redacted-id]");
  const panResult = applyPatterns(aadhaarResult.redacted, [PAN_PATTERN], "[redacted-id]");
  const phoneResult = applyPatterns(panResult.redacted, [PHONE_PATTERN], "[redacted-phone]");
  const urlResult = applyPatterns(phoneResult.redacted, [URL_PATTERN], "[redacted-link]");
  const longBlockResult = applyPatterns(urlResult.redacted, [LONG_DIGIT_BLOCK], "[redacted-number]");
  const otpResult = applyPatterns(longBlockResult.redacted, [OTP_PATTERN], "[redacted-otp]");
  return {
    redacted: otpResult.redacted,
    removed:
      emailResult.removed +
      phoneResult.removed +
      aadhaarResult.removed +
      panResult.removed +
      urlResult.removed +
      longBlockResult.removed +
      otpResult.removed,
  };
}

// Looks like the user typed something sensitive inside an otherwise
// neutral message — used as a soft signal to ask whether they want to
// share contact details.
export function messageLooksSensitive(raw: string): boolean {
  const result = redactSensitive(raw);
  return result.removed > 0 && raw.length < 500;
}

// ── Question selection ───────────────────────────────────────
export const SENSITIVE_FIELDS: ReadonlySet<QuestionField> = new Set<QuestionField>([
  // We treat incident date / purchase location as non-sensitive; only
  // fields where users sometimes paste personal info get flagged.
]);

export function isSensitiveField(field: QuestionField): boolean {
  return SENSITIVE_FIELDS.has(field);
}
