/** A recorded unlock. `achievementId` is unique per user, so a repeat is a no-op. */
export type AchievementRecord = {
  achievementId: string;
  userId: string;
  unlockedAt: string;
  /** XP paid at unlock time, so later config changes cannot rewrite history. */
  xpAwarded: number;
};

/** One achievement plus this user's real progress toward it. */
export type AchievementView = {
  achievement_id: string;
  name: string;
  description: string;
  icon: string;
  condition_type: string;
  target: number;
  progress: number;
  /** Clamped 0..1, for the progress bar only. */
  progress_ratio: number;
  reward_xp: number;
  unlocked: boolean;
  unlocked_at: string | null;
};

export type AchievementListResult = {
  achievements: AchievementView[];
  unlocked: number;
  total: number;
};

export type AchievementFilter = "all" | "unlocked" | "locked";

/** Level state, derived from lifetime XP. Nothing here is stored separately. */
export type LevelView = {
  level: number;
  total_xp: number;
  level_xp: number;
  next_level_xp: number | null;
  current_level_xp: number;
  xp_to_next_level: number;
  progress: number;
  is_max_level: boolean;
};

export type LevelUpEvent = {
  from_level: number;
  to_level: number;
  total_xp: number;
};

/** Module 2 state for a single user, resolved from persisted activity. */
export type AchievementStateResult = {
  level: LevelView;
  achievements: AchievementListResult;
  /** True only when this read crossed a level boundary. */
  leveled_up: boolean;
  level_up: LevelUpEvent | null;
  /** Ids unlocked by this read, so the UI can celebrate each one once. */
  newly_unlocked: string[];
};
