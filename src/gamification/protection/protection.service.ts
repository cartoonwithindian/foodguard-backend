import { getStore } from "@/lib/store";
import type { DataStore } from "@/lib/store/types";
import { gamificationConfig } from "@/gamification/config";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";
import type {
  ClaimRewardResult,
  GamificationOverview,
  RewardListResult,
  StreakProtectionHistoryResult,
  StreakProtectionStatus,
} from "@/gamification/models/rewards";

function rules(now: () => Date): GamificationRules {
  return {
    now,
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
}

export type ClaimRewardCommand = {
  userId: string;
  rewardId?: string | null;
  userRewardId?: string | null;
};

/**
 * Application service for streak protection and rewards (Module 4).
 *
 * It accepts no counts, no completion flags, and no progress from the caller:
 * every figure returned is derived from persisted activity inside the store
 * transaction, which is what keeps the client from asserting its own rewards.
 */
export class Module4Service {
  constructor(
    private readonly storeOverride?: DataStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private store(): DataStore {
    return this.storeOverride ?? getStore();
  }

  private currentRules(): GamificationRules {
    return rules(this.clock);
  }

  getStreakProtection(userId: string): Promise<StreakProtectionStatus> {
    return this.store().getStreakProtection(userId, this.currentRules());
  }

  getStreakProtectionHistory(userId: string): Promise<StreakProtectionHistoryResult> {
    return this.store().getStreakProtectionHistory(userId);
  }

  getRewards(userId: string): Promise<RewardListResult> {
    return this.store().getRewards(userId, this.currentRules());
  }

  getRewardHistory(userId: string): Promise<RewardListResult> {
    return this.store().getRewardHistory(userId, this.currentRules());
  }

  /**
   * Claim an earned reward. Eligibility is re-derived server-side inside the
   * transaction, so a client that posts an unearned reward id gets a rejection
   * rather than a payout.
   */
  claimReward(command: ClaimRewardCommand): Promise<ClaimRewardResult> {
    return this.store().claimReward(
      command.userId,
      {
        rewardId: command.rewardId ?? null,
        userRewardId: command.userRewardId ?? null,
      },
      this.currentRules(),
    );
  }

  getOverview(userId: string): Promise<GamificationOverview> {
    return this.store().getGamificationOverview(userId, this.currentRules());
  }
}

export const module4Service = new Module4Service();
