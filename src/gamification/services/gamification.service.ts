import { randomUUID } from "node:crypto";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import type { DataStore } from "@/lib/store/types";
import { gamificationConfig } from "@/gamification/config";
import type {
  GamificationActivityResult,
  GamificationProfileRecord,
  GamificationRules,
  ProductScanAction,
} from "@/gamification/models/gamification";
import { xpService } from "@/gamification/services/xp.service";
import { streakService } from "@/gamification/services/streak.service";

export type RecordProductScanInput = {
  userId: string;
  productId: string;
  eventId?: string;
  actionType?: ProductScanAction;
};

function rules(now: () => Date): GamificationRules {
  return {
    now,
    duplicateRequestWindowMs: gamificationConfig.duplicateRequestWindowMs,
    xpService,
    streakService,
  };
}

/**
 * Application service for the XP + daily-streak module. It accepts no XP or
 * streak values from callers; the store transaction calculates and persists
 * them using the centralized rules.
 */
export class GamificationService {
  constructor(
    private readonly storeOverride?: DataStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private store(): DataStore {
    return this.storeOverride ?? getStore();
  }

  async recordProductScan(input: RecordProductScanInput): Promise<GamificationActivityResult> {
    const productId = input.productId?.trim();
    if (!productId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "product_id is required");
    }
    if (input.actionType && input.actionType !== "product_scan") {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "Unsupported gamification action");
    }

    const suppliedEventId = input.eventId?.trim();
    if (suppliedEventId && (suppliedEventId.length < 8 || suppliedEventId.length > 128)) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, "event_id must be 8-128 characters");
    }

    const now = this.clock();
    return this.store().recordSuccessfulProductScan(
      {
        userId: input.userId,
        actionType: "product_scan",
        productId,
        timestamp: now,
        eventId: suppliedEventId || randomUUID(),
        eventIdProvided: Boolean(suppliedEventId),
      },
      rules(() => now),
    );
  }

  async getProfile(userId: string): Promise<GamificationProfileRecord> {
    if (!userId.trim()) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, "Authentication required", 401);
    }
    return this.store().getGamificationProfile(userId, rules(this.clock));
  }
}

export const gamificationService = new GamificationService();
