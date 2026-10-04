import type { ChallengeDefinition, ChallengePeriod } from "@/gamification/challenges/config";
import type { ChallengeActivityRow, ChallengeProgressState } from "@/gamification/challenges/progress.service";
import type { ChallengePeriodWindow } from "@/gamification/challenges/period.service";
import type { GamificationActivityRecord, GamificationProfileRecord } from "@/gamification/models/gamification";

/** A configured challenge as returned to API clients. */
export type ChallengeDefinitionView = {
  challenge_id: string;
  name: string;
  description: string;
  challenge_type: "DAILY" | "WEEKLY";
  condition_type: string;
  progress: number;
  target: number;
  xp_reward: number;
  completed: boolean;
  reward_claimed: boolean;
  period_start: string;
  period_end: string;
};

export type ChallengeHistoryView = ChallengeDefinitionView & {
  status: "active" | "completed" | "expired";
  completed_at: string | null;
};

export type ChallengeListResult = {
  daily: ChallengeDefinitionView[];
  weekly: ChallengeDefinitionView[];
  history: ChallengeHistoryView[];
};

export type ChallengeCompletion = {
  challenge_id: string;
  name: string;
  description: string;
  xp_reward: number;
};

export type ChallengeActivityResult = {
  activity: GamificationActivityRecord;
  profile: GamificationProfileRecord;
  challenges: ChallengeDefinitionView[];
  completedChallenges: ChallengeCompletion[];
  idempotent: boolean;
};

export type ValidatedGamificationActivityInput = {
  userId: string;
  actionType: "ingredient_view" | "meaningful_chat";
  productId: string;
  ingredientId?: string | null;
  timestamp: Date;
  eventId: string;
  eventIdProvided: boolean;
};

export type ChallengeEvaluationContext = {
  userId: string;
  timezone: string;
  now: Date;
  activity: GamificationActivityRecord;
  profile: GamificationProfileRecord;
  window: ChallengePeriodWindow;
  definition: ChallengeDefinition;
};

export type ChallengeRuntimeDefinitions = readonly ChallengeDefinition[];

export type ChallengeActivityRowWithWindow = ChallengeActivityRow;

export type ChallengeProgressWithDefinition = ChallengeProgressState & {
  definition: ChallengeDefinition;
};

export type { ChallengePeriod };
