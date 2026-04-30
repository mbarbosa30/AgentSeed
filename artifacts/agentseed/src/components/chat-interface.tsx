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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "chunk") {
              fullText += evt.text;
              setStreamText(fullText);
            } else if (evt.type === "done") {
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
          } catch {}
        }
      }
    } catch (e) {
      onNewMessage({
        id: Date.now() + 1,
        agentId: 0,
        role: "assistant",
        content: "Sorry, I ran into an issue. Try again?",
        createdAt: new Date().toISOString(),
      });
      setStreamText("");
    } finally {
      setStreaming(false);
    }
  };

  const allMessages = [...messages];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
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
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-secondary text-foreground rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {streaming && streamText && (
          <div className="flex gap-3 justify-start" data-testid="msg-streaming">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-secondary text-foreground leading-relaxed">
              {streamText}
              <span className="inline-block w-1 h-4 bg-primary/70 ml-0.5 animate-pulse rounded-full" />
            </div>
          </div>
        )}

        {streaming && !streamText && (
          <div className="flex gap-3 justify-start" data-testid="msg-loading">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-secondary flex gap-1.5 items-center">
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
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
