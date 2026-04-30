import type { AgentLifecycleStage, AgentMood } from "@workspace/api-client-react";

const LIFECYCLE_CONFIG = {
  egg: { label: "Egg", dot: "bg-zinc-400" },
  hatchling: { label: "Hatchling", dot: "bg-emerald-500" },
  worker: { label: "Worker", dot: "bg-blue-500" },
  guild: { label: "Guild", dot: "bg-violet-500" },
} as const;

const MOOD_CONFIG = {
  focused: { label: "Focused" },
  curious: { label: "Curious" },
  confident: { label: "Confident" },
  generous: { label: "Generous" },
  survival: { label: "Survival" },
} as const;

interface LifecycleBadgeProps {
  stage: AgentLifecycleStage | string;
  size?: "sm" | "md";
}

export function LifecycleBadge({ stage, size = "sm" }: LifecycleBadgeProps) {
  const config = LIFECYCLE_CONFIG[stage as AgentLifecycleStage] ?? LIFECYCLE_CONFIG.egg;
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-background text-muted-foreground font-medium ${px}`}
      data-testid={`badge-lifecycle-${stage}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

interface MoodBadgeProps {
  mood: AgentMood | string;
  size?: "sm" | "md";
}

export function MoodBadge({ mood, size = "sm" }: MoodBadgeProps) {
  const config = MOOD_CONFIG[mood as AgentMood] ?? MOOD_CONFIG.focused;
  const px = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full bg-secondary text-secondary-foreground font-medium ${px}`}
      data-testid={`badge-mood-${mood}`}
    >
      {config.label}
    </span>
  );
}
