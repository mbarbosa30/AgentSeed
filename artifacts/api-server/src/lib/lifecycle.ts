export type LifecycleStage = "egg" | "hatchling" | "worker" | "guild";

const STAGE_ORDER: LifecycleStage[] = ["egg", "hatchling", "worker", "guild"];

export const LIFECYCLE_THRESHOLDS = {
  hatchling: 10,
  worker: 50,
  guild: 200,
} as const;

export const LIFECYCLE_TREASURY_REWARD: Record<LifecycleStage, number> = {
  egg: 0,
  hatchling: 50,
  worker: 150,
  guild: 500,
};

export interface GrowthCounts {
  messageCount: number;
  holderCount: number;
  tipCount: number;
}

export function computeGrowthScore(counts: GrowthCounts): number {
  return counts.messageCount + counts.holderCount * 10 + counts.tipCount * 5;
}

export function computeLifecycle(counts: GrowthCounts): LifecycleStage {
  const score = computeGrowthScore(counts);
  if (score >= LIFECYCLE_THRESHOLDS.guild) return "guild";
  if (score >= LIFECYCLE_THRESHOLDS.worker) return "worker";
  if (score >= LIFECYCLE_THRESHOLDS.hatchling) return "hatchling";
  return "egg";
}

function stageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage as LifecycleStage);
  return idx === -1 ? 0 : idx;
}

export interface LifecycleProgression {
  stage: LifecycleStage;
  advanced: boolean;
  treasuryReward: number;
  highlight: string | null;
}

export function progressLifecycle(
  currentStage: string,
  counts: GrowthCounts,
): LifecycleProgression {
  const computedStage = computeLifecycle(counts);
  const currentIdx = stageIndex(currentStage);
  const computedIdx = stageIndex(computedStage);

  // Lifecycle progression is monotonic — agents never lose a stage they've earned.
  if (computedIdx <= currentIdx) {
    const safeStage = (STAGE_ORDER[currentIdx] ?? "egg") as LifecycleStage;
    return { stage: safeStage, advanced: false, treasuryReward: 0, highlight: null };
  }

  let reward = 0;
  for (let i = currentIdx + 1; i <= computedIdx; i++) {
    reward += LIFECYCLE_TREASURY_REWARD[STAGE_ORDER[i]];
  }

  const highlight = `Evolved to ${computedStage} stage — treasury minted +${reward} $tokens`;

  return { stage: computedStage, advanced: true, treasuryReward: reward, highlight };
}
