import { Link } from "wouter";
import type { Agent } from "@workspace/api-client-react";
import { LifecycleBadge, MoodBadge } from "./lifecycle-badge";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link href={`/agent/${agent.slug}`} data-testid={`card-agent-${agent.id}`}>
      <article className="group h-full rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3
              className="font-semibold text-[15px] text-foreground truncate"
              data-testid={`text-agent-name-${agent.id}`}
            >
              {agent.name}
            </h3>
            <span
              className="font-mono text-xs text-muted-foreground"
              data-testid={`text-token-${agent.id}`}
            >
              ${agent.tokenSymbol}
            </span>
          </div>
          <LifecycleBadge stage={agent.lifecycleStage} />
        </div>

        <p
          className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2 mb-4"
          data-testid={`text-mission-${agent.id}`}
        >
          {agent.mission}
        </p>

        <div className="flex items-center justify-between text-[12px] text-muted-foreground border-t border-border pt-3">
          <div className="flex items-center gap-4 font-mono">
            <span data-testid={`stat-treasury-${agent.id}`}>
              <span className="text-foreground">{agent.treasuryBalance.toFixed(1)}</span>
              <span className="ml-1 text-muted-foreground/70">treasury</span>
            </span>
            <span data-testid={`stat-holders-${agent.id}`}>
              <span className="text-foreground">{agent.holderCount}</span>
              <span className="ml-1 text-muted-foreground/70">holders</span>
            </span>
          </div>
          <MoodBadge mood={agent.mood} />
        </div>
      </article>
    </Link>
  );
}
