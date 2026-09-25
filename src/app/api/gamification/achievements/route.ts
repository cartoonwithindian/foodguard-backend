import { NextRequest } from "next/server";
import { jsonError, jsonSuccess } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { module2Service } from "@/gamification/achievements/achievement.service";
import { listAchievementDefinitions } from "@/gamification/achievements/config";
import type { AchievementFilter } from "@/gamification/models/achievements";

export const runtime = "nodejs";

const FILTERS: readonly AchievementFilter[] = ["all", "unlocked", "locked"];

/**
 * GET /api/gamification/achievements
 *
 * Optionally filtered with `?filter=unlocked|locked`. Locked achievements stay
 * visible with real progress; they are never hidden or faked as earned.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  try {
    const session = await requireAuth(request);
    const requested = new URL(request.url).searchParams.get("filter")?.trim().toLowerCase();
    const filter: AchievementFilter = FILTERS.includes(requested as AchievementFilter)
      ? (requested as AchievementFilter)
      : "all";

    const state = await module2Service.getAchievements(session.id);
    const achievements =
      filter === "all"
        ? state.achievements.achievements
        : state.achievements.achievements.filter((view) =>
            filter === "unlocked" ? view.unlocked : !view.unlocked,
          );

    return jsonSuccess(
      {
        level: state.level,
        achievements,
        unlocked: state.achievements.unlocked,
        total: state.achievements.total,
        filter,
        // The configured catalogue, so a client can label progress without
        // hardcoding names or reward amounts.
        catalogue: listAchievementDefinitions().map((definition) => ({
          achievement_id: definition.id,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          target: definition.condition.target,
          reward_xp: definition.rewardXp,
        })),
        leveled_up: state.leveled_up,
        level_up: state.level_up,
        newly_unlocked: state.newly_unlocked,
      },
      { requestId },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}
