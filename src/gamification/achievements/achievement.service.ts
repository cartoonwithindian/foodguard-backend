import { getStore } from "@/lib/store";
import type { DataStore } from "@/lib/store/types";
import { gamificationConfig } from "@/gamification/config";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";
import type { GamificationRules } from "@/gamification/models/gamification";
import type { AchievementStateResult } from "@/gamification/models/achievements";

function rules(now: () => Date): GamificationRules {
  return {
    now,
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
}

/**
 * Application service for levels and achievements (Module 2).
 *
 * It takes no level, XP, or completion input from callers. A level is derived
 * from persisted XP and an unlock is recorded from persisted activity, both
 * inside the store transaction, so the client cannot assert its own progress.
 */
export class Module2Service {
  constructor(
    private readonly storeOverride?: DataStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private store(): DataStore {
    return this.storeOverride ?? getStore();
  }

  getAchievements(userId: string): Promise<AchievementStateResult> {
    return this.store().getAchievementState(userId, rules(this.clock));
  }
}

export const module2Service = new Module2Service();
