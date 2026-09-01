/**
 * FSSAI Claim Checker
 * 
 * Checks if product claims comply with FSSAI advertising regulations.
 */

import { logger } from "@/lib/logger";
import type { ClaimCheckResult } from "./types";

export class ClaimChecker {
  /**
   * Check a list of claims against FSSAI regulations
   */
  async checkClaims(claims: string[]): Promise<ClaimCheckResult[]> {
    const results: ClaimCheckResult[] = [];

    for (const claim of claims) {
      const trimmed = claim.trim();
      if (!trimmed) continue;

      try {
        const result = await this.checkSingleClaim(trimmed);
        results.push(result);
      } catch (error) {
        logger.warn("claim_check_failed", { claim: trimmed, error: String(error) });
        results.push({
          claim: trimmed,
          status: "INSUFFICIENT_DATA",
          conditions: [],
          thresholds: [],
          sourceReferences: [],
        });
      }
    }

    return results;
  }

  /**
   * Check a single claim against FSSAI regulations
   */
  async checkSingleClaim(claim: string): Promise<ClaimCheckResult> {
    const normalizedClaim = claim.toLowerCase().trim();

    // Define known claim patterns and their statuses
    const claimPatterns: Record<string, { status: ClaimCheckResult["status"]; conditions: string[] }> = {
      // Nutrient content claims
      "high protein": { status: "SUPPORTED", conditions: ["Must meet minimum protein content as per FSSAI"] },
      "low fat": { status: "SUPPORTED", conditions: ["Must meet maximum fat content as per FSSAI"] },
      "sugar free": { status: "SUPPORTED", conditions: ["Must contain less than 0.5g sugar per 100g"] },
      "no added sugar": { status: "SUPPORTED", conditions: ["Must not contain added sugars"] },
      "low sodium": { status: "SUPPORTED", conditions: ["Must meet maximum sodium content as per FSSAI"] },
      "high fibre": { status: "SUPPORTED", conditions: ["Must meet minimum fibre content as per FSSAI"] },

      // Health claims
      "healthy": { status: "REQUIRES_REVIEW", conditions: ["Health claims require FSSAI approval"] },
      "good for heart": { status: "REQUIRES_REVIEW", conditions: ["Health claims require FSSAI approval"] },
      "boosts immunity": { status: "REQUIRES_REVIEW", conditions: ["Health claims require FSSAI approval"] },

      // Special category claims
      "organic": { status: "SUPPORTED", conditions: ["Must be certified organic as per FSSAI Organic Regulations"] },
      "natural": { status: "REQUIRES_REVIEW", conditions: ["Must meet FSSAI definition of 'natural'"] },
      "fortified": { status: "SUPPORTED", conditions: ["Must meet FSSAI fortification standards"] },
      "vegan": { status: "SUPPORTED", conditions: ["Must meet FSSAI Vegan Food Regulations"] },
      "gluten free": { status: "SUPPORTED", conditions: ["Must contain less than 20ppm gluten"] },

      // Prohibited claims
      "cures": { status: "PROHIBITED", conditions: ["Disease cure claims are prohibited"] },
      "treats": { status: "PROHIBITED", conditions: ["Disease treatment claims are prohibited"] },
      "prevents disease": { status: "PROHIBITED", conditions: ["Disease prevention claims are prohibited"] },
    };

    // Check for exact matches
    for (const [pattern, config] of Object.entries(claimPatterns)) {
      if (normalizedClaim.includes(pattern)) {
        return {
          claim,
          status: config.status,
          conditions: config.conditions,
          thresholds: [],
          sourceReferences: [],
        };
      }
    }

    // Default to requiring review for unrecognized claims
    return {
      claim,
      status: "REQUIRES_REVIEW",
      conditions: ["Unrecognized claim - requires manual review"],
      thresholds: [],
      sourceReferences: [],
    };
  }
}