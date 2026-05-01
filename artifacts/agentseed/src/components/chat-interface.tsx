import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, MapPin, Star, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentMessage } from "@workspace/api-client-react";

interface ChatInterfaceProps {
  slug: string;
  messages: AgentMessage[];
  onNewMessage: (msg: AgentMessage) => void;
  apiBase: string;
}

interface ToolActivity {
  productCode: string;
  title: string;
  description: string;
  location: string;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  durationMinutes: number | null;
  priceFrom: number | null;
  currency: string;
  bookUrl: string;
}

interface ToolResultPayload {
  tool: string;
  mode: "live" | "demo";
  query: string;
  destination: string | null;
  activities: ToolActivity[];
}

interface ChatItem {
  kind: "msg" | "tool";
  key: string;
  msg?: AgentMessage;
  tool?: ToolResultPayload;
}

function buildItems(messages: AgentMessage[], inlineTool: ToolResultPayload[]): ChatItem[] {
  const out: ChatItem[] = messages.map((m) => ({
    kind: "msg" as const,
    key: `m-${m.id}`,
    msg: m,
  }));
  inlineTool.forEach((t, i) => {
    out.push({ kind: "tool", key: `t-live-${i}`, tool: t });
  });
  return out;
}

function formatDuration(min: number | null): string | null {
  if (min == null) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function ActivityCards({ payload, base }: { payload: ToolResultPayload; base: string }) {
  if (payload.activities.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-border bg-secondary/30 px-3 py-2.5 text-xs text-muted-foreground"
        data-testid="tool-result-empty"
      >
        No matching activities found for "{payload.query}"
        {payload.destination ? ` in ${payload.destination}` : ""}.
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="tool-result-activities">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/80">
        <MapPin className="w-3 h-3" />
        <span>
          Viator • {payload.activities.length} {payload.activities.length === 1 ? "activity" : "activities"}
          {payload.destination ? ` in ${payload.destination}` : ""}
        </span>
        {payload.mode === "demo" && (
          <span className="rounded-full border border-amber-400/40 bg-amber-50/60 px-1.5 py-px text-[9px] font-medium text-amber-700">
            demo data
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {payload.activities.map((a) => {
          const href = a.bookUrl.startsWith("http") ? a.bookUrl : `${base}${a.bookUrl}`;
          const duration = formatDuration(a.durationMinutes);
          return (
            <a
              key={a.productCode}
              href={href}
              target="_blank"
              rel="noopener noreferrer sponsored"
              data-testid={`activity-card-${a.productCode}`}
              className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden transition hover:border-foreground/40 hover:shadow-sm"
            >
              {a.imageUrl ? (
                <div className="aspect-[16/9] w-full overflow-hidden bg-secondary">
                  <img
                    src={a.imageUrl}
                    alt={a.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                </div>
              ) : (
                <div className="aspect-[16/9] w-full bg-gradient-to-br from-secondary to-secondary/40 flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-muted-foreground/40" />
                </div>
              )}
              <div className="p-3 flex flex-col gap-1.5 flex-1">
                <h4 className="text-sm font-medium leading-snug line-clamp-2">{a.title}</h4>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {a.location}
                  </span>
                  {a.rating != null && (
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {a.rating.toFixed(1)}
                      {a.reviewCount != null && (
                        <span className="opacity-70">({a.reviewCount})</span>
                      )}
                    </span>
                  )}
                  {duration && (
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {duration}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                <div className="mt-auto flex items-center justify-between pt-1.5">
                  <div className="text-xs">
                    {a.priceFrom != null ? (
                      <>
                        <span className="text-muted-foreground">from </span>
                        <span className="font-semibold text-foreground">
                          {a.currency} {a.priceFrom.toFixed(0)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">price on Viator</span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                    Book on Viator
                    <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ChatInterface({ slug, messages, onNewMessage, apiBase }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [liveToolResults, setLiveToolResults] = useState<ToolResultPayload[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamText, liveToolResults]);

  const baseRoot = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;

  const send = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");
    setStreaming(true);
    setStreamText("");
    setLiveToolResults([]);

    const userMsg: AgentMessage = {
      id: Date.now(),
      agentId: 0,
      role: "user",
      isHeartbeat: false,
      content,
      createdAt: new Date().toISOString(),
    };
    onNewMessage(userMsg);

    let assistantAppended = false;
    try {
      const res = await fetch(`${baseRoot}/api/agents/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let streamErrored = false;
      let buffer = "";
      const collectedTools: ToolResultPayload[] = [];

      const handleLine = (line: string): boolean => {
        if (!line.startsWith("data: ")) return true;
        let evt:
          | { type?: string; text?: string; message?: string; payload?: ToolResultPayload }
          | null = null;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          return true;
        }
        if (!evt) return true;
        if (evt.type === "chunk") {
          fullText += evt.text ?? "";
          setStreamText(fullText);
        } else if (evt.type === "tool_result" && evt.payload) {
          collectedTools.push(evt.payload);
          setLiveToolResults([...collectedTools]);
        } else if (evt.type === "done") {
          if (!assistantAppended) {
            assistantAppended = true;
            const assistantMsg: AgentMessage = {
              id: Date.now() + 1,
              agentId: 0,
              role: "assistant",
              isHeartbeat: false,
              content: fullText,
              createdAt: new Date().toISOString(),
            };
            onNewMessage(assistantMsg);
            setStreamText("");
          }
        } else if (evt.type === "error") {
          streamErrored = true;
          return false;
        }
        return true;
      };

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          const tail = buffer.split("\n");
          for (const line of tail) {
            if (!handleLine(line)) break outer;
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (!handleLine(line)) break outer;
        }
      }

      if (streamErrored) throw new Error("Stream error");
    } catch {
      if (!assistantAppended) {
        onNewMessage({
          id: Date.now() + 1,
          agentId: 0,
          role: "assistant",
          isHeartbeat: false,
          content: "Sorry, I ran into an issue. Try again?",
          createdAt: new Date().toISOString(),
        });
      }
      setStreamText("");
    } finally {
      setStreaming(false);
    }
  };

  const items = buildItems(messages, liveToolResults);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 p-4">
        {items.length === 0 && !streaming && (
          <div className="text-center text-muted-foreground text-sm py-8" data-testid="text-chat-empty">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Send a message to start the conversation</p>
          </div>
        )}
        {items.map((item) => {
          if (item.kind === "tool" && item.tool) {
            return (
              <div key={item.key} className="flex gap-3 justify-start">
                <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 max-w-[90%]">
                  <ActivityCards payload={item.tool} base={baseRoot} />
                </div>
              </div>
            );
          }
          const msg = item.msg!;
          const isHeartbeat = msg.role === "assistant" && msg.isHeartbeat;
          return (
            <div
              key={item.key}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`msg-${msg.role}-${msg.id}${isHeartbeat ? "-heartbeat" : ""}`}
            >
              {msg.role === "assistant" && (
                <div
                  className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    isHeartbeat
                      ? "bg-primary/5 border-primary/30"
                      : "bg-secondary border-border"
                  }`}
                >
                  {isHeartbeat ? (
                    <Sparkles className="w-3.5 h-3.5 text-primary/70" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="flex flex-col gap-1 max-w-[80%]">
                {isHeartbeat && (
                  <span
                    className="text-[10px] uppercase tracking-wider text-muted-foreground/70 flex items-center gap-1"
                    data-testid={`msg-heartbeat-badge-${msg.id}`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Self-initiated thought
                  </span>
                )}
                {msg.content && (
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-foreground text-background rounded-br-md"
                        : isHeartbeat
                          ? "bg-secondary/40 text-muted-foreground italic rounded-bl-md border border-dashed border-border/60"
                          : "bg-secondary text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {streaming && streamText && (
          <div className="flex gap-3 justify-start" data-testid="msg-streaming">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-secondary text-foreground leading-relaxed whitespace-pre-wrap">
              {streamText}
              <span className="inline-block w-1 h-4 bg-foreground/70 ml-0.5 animate-pulse rounded-full" />
            </div>
          </div>
        )}

        {streaming && !streamText && (
          <div className="flex gap-3 justify-start" data-testid="msg-loading">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
              <Bot className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-secondary flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <Input
            data-testid="input-chat"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message the agent..."
            disabled={streaming}
            className="flex-1"
          />
          <Button
            data-testid="button-send"
            onClick={send}
            disabled={streaming || !input.trim()}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
