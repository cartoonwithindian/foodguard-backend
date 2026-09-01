import type { ChatIntent } from "@/types/chat";

const RULES: Array<{ intent: ChatIntent; patterns: RegExp[] }> = [
  {
    intent: "CONCERN_LEVEL_EXPLANATION",
    patterns: [
      /(high|moderate|low) concern/i,
      /what does .{0,30}concern mean/i,
      /why (is|was) this (product )?(high|moderate|low)/i,
      /concern level/i,
    ],
  },
  {
    intent: "PRODUCT_EXPLANATION",
    patterns: [
      /why/i,
      /explain (this )?(product|it)/i,
      /about this product/i,
      /what.{0,40}(product|it).{0,40}(mean|tell|analysis)/i,
      /is (this|it) (good|safe|healthy|fine)/i,
    ],
  },
  {
    intent: "REGULATORY_INFORMATION",
    patterns: [
      /fssai/i,
      /regulation/i,
      /labelling (rules|requirements|regulations)/i,
      /legal/i,
      /law/i,
      /complaint to/i,
      /permitted|banned|prohibited|allowed (in|under|by)/i,
      /labelling|label (must|should|required)|label requirements/i,
    ],
  },
  {
    intent: "REPORT_REQUEST",
    patterns: [
      /report/i,
      /complaint/i,
      /grievance/i,
      /(how do|i want to|help me) (report|complain)/i,
    ],
  },
  {
    intent: "INGREDIENT_EXPLANATION",
    patterns: [
      /ingredient/i,
      /\bins\s?\d{3,4}\b/i,
      /additive/i,
      /e-?\d{3,4}\b/i,
      /what is/i,
      /preservative|colour|emulsifier|thickener|sweetener/i,
    ],
  },
  {
    intent: "SCAN_HISTORY",
    patterns: [
      /(did|have) i scan/i,
      /scan history/i,
      /recent scans/i,
      /what products did i scan/i,
      /my (scans|history)/i,
    ],
  },
  {
    intent: "PRODUCT_COMPARISON",
    patterns: [/(compare|comparison)/i, /\bvs\b|\bversus\b/i],
  },
  {
    intent: "FOOD_SAFETY_QUESTION",
    patterns: [
      /check before buying/i,
      /expiry|best before/i,
      /allergen/i,
      /safe to (eat|consume|drink)/i,
      /storage/i,
      /packaging condition/i,
      /nutrition (label|information)/i,
    ],
  },
  {
    intent: "GENERAL_FOODGUARD_HELP",
    patterns: [
      /^(hi|hello|hey|namaste|help|what can you do)\b/i,
      /^how (do|does) foodguard/i,
      /what is foodguard/i,
    ],
  },
];

export function detectIntent(message: string, productId?: string | null): ChatIntent {
  const text = message.trim();
  if (!text) return "UNKNOWN";

  // "Why?" alone in a product-context chat refers to the attached product.
  if (productId && /^why\b/i.test(text) && text.length <= 10) {
    return "PRODUCT_EXPLANATION";
  }

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) return rule.intent;
    }
  }
  return "UNKNOWN";
}