import { Link } from "wouter";
import { Coins, MessageSquare, Users } from "lucide-react";
import type { Agent } from "@workspace/api-client-react";
import { LifecycleBadge, MoodBadge } from "./lifecycle-badge";
import { Card } from "@/components/ui/card";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  return (
    <Link href={`/agent/${agent.slug}`} data-testid={`card-agent-${agent.id}`}>
        <Card className="p-4 bg-card border-border hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer group h-full">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors" data-testid={`text-agent-name-${agent.id}`}>
                  {agent.name}
                </h3>
                <span className="font-mono text-xs text-accent font-bold" data-testid={`text-token-${agent.id}`}>
                  ${agent.tokenSymbol}
                </span>
              </div>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <LifecycleBadge stage={agent.lifecycleStage} />
                <MoodBadge mood={agent.mood} />
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 mb-3" data-testid={`text-mission-${agent.id}`}>
            {agent.mission}
          </p>

          <div className="flex items-center gap-3 text-xs text-muted-foreground border-t border-border/50 pt-3">
            <span className="flex items-center gap-1" data-testid={`stat-treasury-${agent.id}`}>
              <Coins className="w-3 h-3 text-accent" />
              {agent.treasuryBalance.toFixed(1)}
            </span>
            <span className="flex items-center gap-1" data-testid={`stat-holders-${agent.id}`}>
              <Users className="w-3 h-3" />
              {agent.holderCount}
            </span>
            <span className="flex items-center gap-1 ml-auto" data-testid={`stat-date-${agent.id}`}>
              <MessageSquare className="w-3 h-3" />
              {new Date(agent.createdAt).toLocaleDateString()}
            </span>
          </div>
        </Card>
    </Link>
  );
}
