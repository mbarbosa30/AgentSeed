import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentMessage } from "@workspace/api-client-react";

interface ChatInterfaceProps {
  slug: string;
  messages: AgentMessage[];
  onNewMessage: (msg: AgentMessage) => void;
  apiBase: string;
}

export function ChatInterface({ slug, messages, onNewMessage, apiBase }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamText]);

  const send = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    setInput("");
    setStreaming(true);
    setStreamText("");

    const userMsg: AgentMessage = {
      id: Date.now(),
      agentId: 0,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    onNewMessage(userMsg);

    let assistantAppended = false;
    try {
      const base = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
      const res = await fetch(`${base}/api/agents/${slug}/messages`, {
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

      const handleLine = (line: string): boolean => {
        if (!line.startsWith("data: ")) return true;
        let evt: { type?: string; text?: string; message?: string } | null = null;
        try {
          evt = JSON.parse(line.slice(6));
        } catch {
          return true;
        }
        if (!evt) return true;
        if (evt.type === "chunk") {
          fullText += evt.text ?? "";
          setStreamText(fullText);
        } else if (evt.type === "done") {
          if (!assistantAppended) {
            assistantAppended = true;
            const assistantMsg: AgentMessage = {
              id: Date.now() + 1,
              agentId: 0,
              role: "assistant",
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
    } catch (e) {
      if (!assistantAppended) {
        onNewMessage({
          id: Date.now() + 1,
          agentId: 0,
          role: "assistant",
          content: "Sorry, I ran into an issue. Try again?",
          createdAt: new Date().toISOString(),
        });
      }
      setStreamText("");
    } finally {
      setStreaming(false);
    }
  };

  const allMessages = [...messages];

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto space-y-4 p-4">
        {allMessages.length === 0 && !streaming && (
          <div className="text-center text-muted-foreground text-sm py-8" data-testid="text-chat-empty">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Send a message to start the conversation</p>
          </div>
        )}
        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`msg-${msg.role}-${msg.id}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-foreground text-background rounded-br-md"
                  : "bg-secondary text-foreground rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {streaming && streamText && (
          <div className="flex gap-3 justify-start" data-testid="msg-streaming">
            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-secondary text-foreground leading-relaxed">
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
