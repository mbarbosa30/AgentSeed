import type { AgentLifecycleStage, AgentMood } from "@workspace/api-client-react";

const LIFECYCLE_CONFIG = {
  egg: { label: "Egg", emoji: "🥚", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30" },
  hatchling: { label: "Hatchling", emoji: "🐣", color: "text-green-400 bg-green-400/10 border-green-400/30" },
  worker: { label: "Worker", emoji: "⚡", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  guild: { label: "Guild", emoji: "👑", color: "text-purple-400 bg-purple-400/10 border-purple-400/30" },
} as const;

const MOOD_CONFIG = {
  focused: { label: "Focused", emoji: "🎯" },
  curious: { label: "Curious", emoji: "🔍" },
  confident: { label: "Confident", emoji: "💪" },
  generous: { label: "Generous", emoji: "🎁" },
  survival: { label: "Survival", emoji: "⚠️" },
} as const;

interface LifecycleBadgeProps {
  stage: AgentLifecycleStage | string;
  size?: "sm" | "md";
}

export function LifecycleBadge({ stage, size = "sm" }: LifecycleBadgeProps) {
  const config = LIFECYCLE_CONFIG[stage as AgentLifecycleStage] ?? LIFECYCLE_CONFIG.egg;
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.color} ${px}`}
      data-testid={`badge-lifecycle-${stage}`}
    >
      <span>{config.emoji}</span>
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
  const px = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 text-muted-foreground font-medium ${px}`}
      data-testid={`badge-mood-${mood}`}
    >
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}
