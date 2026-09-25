import { gamificationConfig, type DuplicateProductPolicy } from "@/gamification/config";

export type ProductScanXpInput = {
  isNewProduct: boolean;
  hasPriorProductOnDate: boolean;
};

/**
 * Calculates the reward for one validated successful product scan.
 *
 * `base_only` is the initial policy: a repeated product earns the base scan
 * amount but never the one-time unique-product bonus. The other policies are
 * explicit alternatives for future product requirements.
 */
export class XPService {
  constructor(
    private readonly successfulScanXp = gamificationConfig.successfulScanXp,
    private readonly uniqueProductXp = gamificationConfig.uniqueProductXp,
    private readonly duplicatePolicy: DuplicateProductPolicy =
      gamificationConfig.duplicateProductPolicy,
  ) {}

  /**
   * Returns a validated challenge reward. Challenge definitions own the
   * amount; this keeps every XP award flowing through the Module 1 service.
   */
  calculateChallengeReward(rewardXp: number): number {
    return Number.isSafeInteger(rewardXp) && rewardXp >= 0 ? rewardXp : 0;
  }

  calculateProductScanXp(input: ProductScanXpInput): number {
    if (input.isNewProduct) {
      return this.successfulScanXp + this.uniqueProductXp;
    }

    switch (this.duplicatePolicy) {
      case "no_xp":
        return 0;
      case "once_per_day":
        return input.hasPriorProductOnDate ? 0 : this.successfulScanXp;
      case "base_only":
      default:
        return this.successfulScanXp;
    }
  }
}

export const xpService = new XPService();
