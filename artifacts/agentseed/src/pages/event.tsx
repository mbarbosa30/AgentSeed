import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  RadioTower,
  Zap,
  Bot,
  Send,
  Users,
  ArrowLeft,
} from "lucide-react";
import {
  useGetAgent,
  useGetAgentStats,
  useGetAgentSupporters,
  getGetAgentQueryKey,
  getGetAgentStatsQueryKey,
  getGetAgentSupportersQueryKey,
  type AgentMessage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LifecycleBadge, MoodBadge } from "@/components/lifecycle-badge";
import { BondingCurve } from "@/components/bonding-curve";

const SCOUT_SLUG = "agents-day-scout";
const apiBase = import.meta.env.VITE_API_URL ?? "";

const LIVE_FEED_ITEMS = [
  { id: 1, text: "Nexus joined the network", time: "2m ago", icon: "🌐" },
  { id: 2, text: "$SCOUT tip: 50 tokens", time: "5m ago", icon: "💸" },
  { id: 3, text: "New supporter: @cryptobob", time: "8m ago", icon: "❤️" },
  { id: 4, text: "Vote: Expand memory scope", time: "12m ago", icon: "🗳️" },
  { id: 5, text: "Scout leveled up: Hatchling!", time: "20m ago", icon: "🐣" },
];

export default function EventMode() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [handle, setHandle] = useState("visitor");

  const { data: agent } = useGetAgent(SCOUT_SLUG, {
    query: {
      queryKey: getGetAgentQueryKey(SCOUT_SLUG),
      retry: false,
    },
  });

  const { data: stats } = useGetAgentStats(SCOUT_SLUG, {
    query: {
      queryKey: getGetAgentStatsQueryKey(SCOUT_SLUG),
      enabled: !!agent,
      refetchInterval: 15_000,
    },
  });

  const { data: supporters = [] } = useGetAgentSupporters(SCOUT_SLUG, {
    query: {
      queryKey: getGetAgentSupportersQueryKey(SCOUT_SLUG),
      enabled: !!agent,
      refetchInterval: 30_000,
    },
  });

  const send = async () => {
    const content = input.trim();
    if (!content || streaming || !agent) return;
    setInput("");
    setStreaming(true);
    setStreamText("");

    const userMsg: AgentMessage = {
      id: Date.now(),
      agentId: agent.id,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const res = await fetch(`${base}/api/agents/${SCOUT_SLUG}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, userHandle: handle }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "chunk") {
              fullText += evt.text;
              setStreamText(fullText);
            } else if (evt.type === "done") {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now() + 1,
                  agentId: agent.id,
                  role: "assistant",
                  content: fullText,
                  createdAt: new Date().toISOString(),
                },
              ]);
              setStreamText("");
            }
          } catch {}
        }
      }
    } catch {
      setStreamText("");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border/50 bg-background/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5 -ml-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                Home
              </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="font-bold text-sm">
              Agent<span className="text-primary">Seed</span>{" "}
              <span className="text-muted-foreground font-normal">Event Mode</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RadioTower className="w-3.5 h-3.5 text-green-400" />
          <span>Agents Day Lisbon — Live</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 overflow-hidden" style={{ height: "calc(100vh - 53px)" }}>
        <div className="flex flex-col border-r border-border/30 overflow-hidden">
          <div className="border-b border-border/30 px-6 py-4">
            {agent ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-lg" data-testid="text-scout-name">{agent.name}</h2>
                    <span className="font-mono text-sm text-accent font-bold">${agent.tokenSymbol}</span>
                  </div>
                  <div className="flex gap-1.5 mt-0.5">
                    <LifecycleBadge stage={agent.lifecycleStage} />
                    <MoodBadge mood={agent.mood} />
                  </div>
                </div>
                {stats && (
                  <div className="ml-auto flex gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-primary">{stats.totalMessages}</div>
                      <div className="text-muted-foreground text-xs">messages</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-accent">{stats.usefulnessScore}</div>
                      <div className="text-muted-foreground text-xs">score</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold">{stats.supporterCount}</div>
                      <div className="text-muted-foreground text-xs">backers</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted/30 animate-pulse" />
                <div>
                  <div className="h-5 w-36 bg-muted/30 rounded animate-pulse mb-1" />
                  <div className="h-3 w-24 bg-muted/30 rounded animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {!agent && (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <div>
                <Bot className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-muted-foreground font-medium">Scout not found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create the Agents Day Scout agent first
                </p>
                <Link href="/">
                    <Button className="mt-4" size="sm">Go to home</Button>
                </Link>
              </div>
            </div>
          )}

          {agent && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && !streaming && (
                  <div className="text-center py-8" data-testid="text-event-empty">
                    <div className="text-4xl mb-3">🤖</div>
                    <p className="text-muted-foreground text-sm">
                      Ask Scout about anything — agents, tokens, the Lisbon hackathon!
                    </p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    data-testid={`event-msg-${msg.role}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm"}`}>
                      {msg.role === "user" && (
                        <div className="text-xs opacity-70 mb-1">@{handle}</div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}
                {streaming && streamText && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-secondary">
                      {streamText}
                      <span className="inline-block w-1 h-4 bg-primary/70 ml-0.5 animate-pulse rounded-full" />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border p-3 space-y-2">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Your handle:</span>
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="h-7 text-xs w-28"
                    placeholder="visitor"
                    data-testid="input-handle"
                  />
                </div>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-event-chat"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="Ask Scout anything…"
                    disabled={streaming}
                    className="flex-1"
                  />
                  <Button
                    data-testid="button-event-send"
                    onClick={send}
                    disabled={streaming || !input.trim()}
                    size="icon"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="overflow-y-auto bg-card/30 flex flex-col">
          <div className="p-4 border-b border-border/30">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              Live Activity
            </h3>
          </div>
          <div className="p-3 space-y-2 flex-1">
            {LIVE_FEED_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2.5 rounded-lg bg-background/50 border border-border/30 text-sm"
                data-testid={`feed-item-${item.id}`}
              >
                <span className="text-base">{item.icon}</span>
                <div>
                  <div className="text-foreground">{item.text}</div>
                  <div className="text-xs text-muted-foreground">{item.time}</div>
                </div>
              </div>
            ))}
          </div>

          {stats?.bondingCurvePoints && (
            <div className="p-4 border-t border-border/30">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="font-mono text-accent text-xs">$SCOUT</span>
                Bonding Curve
              </h3>
              <BondingCurve
                points={stats.bondingCurvePoints}
                currentSupply={stats.supporterCount}
              />
            </div>
          )}

          <div className="p-4 border-t border-border/30">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-pink-400" />
              Top Supporters
            </h3>
            <div className="space-y-1.5">
              {supporters.slice(0, 5).map((s) => (
                <div key={s.id} className="flex justify-between text-xs" data-testid={`event-supporter-${s.id}`}>
                  <span className="text-muted-foreground">@{s.nickname}</span>
                  <span className="font-mono text-accent">{s.tokens}</span>
                </div>
              ))}
              {supporters.length === 0 && (
                <p className="text-xs text-muted-foreground">No supporters yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
