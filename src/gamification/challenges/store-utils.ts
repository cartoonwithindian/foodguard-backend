import type { ChallengeDefinition } from "@/gamification/challenges/config";

export type ChallengeDefinitionRow = {
  challengeId: string;
  name: string;
  description: string;
  challengeType: string;
  conditionType: string;
  targetValue: number;
  xpReward: number;
  startRule: string;
  endRule: string;
  enabled: boolean;
};

export function challengeDefinitionToRow(
  definition: ChallengeDefinition,
): ChallengeDefinitionRow {
  return {
    challengeId: definition.id,
    name: definition.title,
    description: definition.description,
    challengeType: definition.period.toUpperCase(),
    conditionType: definition.condition.type,
    targetValue: definition.condition.target,
    xpReward: definition.rewardXp,
    startRule: definition.startRule,
    endRule: definition.endRule,
    enabled: true,
  };
}

export function challengeRowToDefinition(row: ChallengeDefinitionRow): ChallengeDefinition {
  return {
    id: row.challengeId,
    title: row.name,
    description: row.description,
    period: row.challengeType.toLowerCase() === "weekly" ? "weekly" : "daily",
    condition: {
      type: row.conditionType as ChallengeDefinition["condition"]["type"],
      target: row.targetValue,
    },
    rewardXp: row.xpReward,
    startRule: row.startRule,
    endRule: row.endRule,
  };
}

/**
 * The backend returns the exclusive period end instant as a local date key.
 * Clients render the last day the challenge is actually active.
 */
export function inclusiveEndDate(exclusiveEndDate: string): string {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exclusiveEndDate);
  if (!parsed) return exclusiveEndDate;
  const [, year, month, day] = parsed;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
