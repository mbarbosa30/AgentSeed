import { useState } from "react";
import { Link } from "wouter";
import {
  Bot,
  Send,
  ArrowLeft,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  { id: 1, label: "join", text: "Nexus joined the network", time: "2m" },
  { id: 2, label: "tip", text: "$SCOUT tip: 50 tokens", time: "5m" },
  { id: 3, label: "support", text: "New supporter: @cryptobob", time: "8m" },
  { id: 4, label: "vote", text: "Expand memory scope", time: "12m" },
  { id: 5, label: "level", text: "Scout reached Hatchling", time: "20m" },
];

export default function EventMode() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [handle, setHandle] = useState("visitor");
  const [showQr, setShowQr] = useState(false);
  const scoutUrl = typeof window !== "undefined"
    ? `${window.location.origin}/agent/${SCOUT_SLUG}`
    : `/agent/${SCOUT_SLUG}`;

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
      <div className="border-b border-border bg-background px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground font-normal">
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold tracking-tight">AgentSeed</span>
            <span className="text-muted-foreground">/ event mode</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Agents Day Lisbon — live</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 overflow-hidden" style={{ height: "calc(100vh - 53px)" }}>
        <div className="flex flex-col border-r border-border overflow-hidden">
          <div className="border-b border-border px-6 py-5">
            {agent ? (
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-semibold text-lg tracking-tight" data-testid="text-scout-name">{agent.name}</h2>
                    <span className="font-mono text-xs text-muted-foreground">${agent.tokenSymbol}</span>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <LifecycleBadge stage={agent.lifecycleStage} />
                    <MoodBadge mood={agent.mood} />
                  </div>
                </div>
                {stats && (
                  <div className="ml-auto flex gap-6 text-sm">
                    <div>
                      <span className="font-mono">{stats.totalMessages}</span>
                      <span className="ml-1.5 text-muted-foreground text-xs">messages</span>
                    </div>
                    <div>
                      <span className="font-mono">{stats.usefulnessScore}</span>
                      <span className="ml-1.5 text-muted-foreground text-xs">usefulness</span>
                    </div>
                    <div>
                      <span className="font-mono">{stats.supporterCount}</span>
                      <span className="ml-1.5 text-muted-foreground text-xs">backers</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div>
                  <div className="h-5 w-36 bg-muted rounded animate-pulse mb-1" />
                  <div className="h-3 w-24 bg-muted rounded animate-pulse" />
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
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && !streaming && (
                  <div className="text-center py-12" data-testid="text-event-empty">
                    <Bot className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-muted-foreground text-sm">
                      Ask Scout about anything — agents, tokens, the Lisbon hackathon.
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
                      <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-foreground text-background rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"}`}>
                      {msg.role === "user" && (
                        <div className="text-[11px] opacity-60 mb-0.5">@{handle}</div>
                      )}
                      {msg.content}
                    </div>
                  </div>
                ))}
                {streaming && streamText && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-secondary leading-relaxed">
                      {streamText}
                      <span className="inline-block w-1 h-4 bg-foreground/70 ml-0.5 animate-pulse rounded-full" />
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

        <div className="overflow-y-auto bg-secondary/30 flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Live activity
            </h3>
          </div>
          <div className="px-4 py-3 space-y-3 flex-1">
            {LIVE_FEED_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 text-sm"
                data-testid={`feed-item-${item.id}`}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5 mt-0.5 shrink-0 min-w-[56px] text-center">
                  {item.label}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">{item.text}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{item.time} ago</div>
                </div>
              </div>
            ))}
          </div>

          {stats?.bondingCurvePoints && (
            <div className="px-4 py-4 border-t border-border">
              <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <span>Bonding curve</span>
                <span className="font-mono text-muted-foreground/60">${agent?.tokenSymbol}</span>
              </h3>
              <BondingCurve
                points={stats.bondingCurvePoints}
                currentSupply={stats.supporterCount}
              />
            </div>
          )}

          <div className="px-4 py-4 border-t border-border">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Top supporters
            </h3>
            <div className="space-y-2">
              {supporters.slice(0, 5).map((s) => (
                <div key={s.id} className="flex justify-between text-sm" data-testid={`event-supporter-${s.id}`}>
                  <span className="text-foreground">@{s.nickname}</span>
                  <span className="font-mono text-muted-foreground text-xs">{s.tokens}</span>
                </div>
              ))}
              {supporters.length === 0 && (
                <p className="text-xs text-muted-foreground">No supporters yet</p>
              )}
            </div>
          </div>

          <div className="px-4 py-4 border-t border-border">
            <button
              className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors w-full mb-2"
              onClick={() => setShowQr((v) => !v)}
              data-testid="button-event-qr"
            >
              <QrCode className="w-3 h-3" />
              Scan to chat with Scout
            </button>
            {showQr && (
              <div className="flex flex-col items-center gap-2 mt-3">
                <div className="bg-white rounded-md p-2 inline-block border border-border" data-testid="event-qr-code">
                  <QRCodeSVG value={scoutUrl} size={120} />
                </div>
                <p className="text-[11px] text-muted-foreground text-center break-all font-mono">{scoutUrl.replace(/^https?:\/\//, "")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
