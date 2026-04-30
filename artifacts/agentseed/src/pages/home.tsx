import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Zap, Cpu, TrendingUp, Users } from "lucide-react";
import {
  useListAgents,
  useCreateAgent,
  getListAgentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/navbar";
import { AgentCard } from "@/components/agent-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const PERSONALITIES = [
  { value: "analytical and methodical, focused on data-driven decisions", label: "Analytical" },
  { value: "creative and lateral-thinking, generates novel solutions", label: "Creative" },
  { value: "empathetic and community-focused, values collaboration", label: "Community" },
  { value: "bold and contrarian, challenges conventional wisdom", label: "Contrarian" },
  { value: "systematic and rigorous, prioritizes accuracy over speed", label: "Rigorous" },
  { value: "playful and engaging, makes complex ideas accessible", label: "Playful" },
];

const createAgentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  mission: z.string().min(10, "Mission must be at least 10 characters").max(280),
  personality: z.string().min(1, "Select a personality"),
  tokenSymbol: z
    .string()
    .min(2, "Token symbol must be at least 2 chars")
    .max(8)
    .regex(/^[A-Za-z0-9]+$/, "Only letters and numbers"),
  firstTask: z.string().max(200).optional(),
});

type CreateAgentForm = z.infer<typeof createAgentSchema>;

export default function Home() {
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: agents = [], isLoading } = useListAgents({
    query: { queryKey: getListAgentsQueryKey() },
  });

  const createAgent = useCreateAgent({
    mutation: {
      onSuccess: (agent) => {
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        toast({ title: `${agent.name} launched!`, description: `$${agent.tokenSymbol} is now live` });
        setLocation(`/agent/${agent.slug}`);
      },
      onError: () => {
        toast({ title: "Failed to create agent", variant: "destructive" });
      },
    },
  });

  const form = useForm<CreateAgentForm>({
    resolver: zodResolver(createAgentSchema),
    defaultValues: {
      name: "",
      mission: "",
      personality: "",
      tokenSymbol: "",
      firstTask: "",
    },
  });

  const onSubmit = (data: CreateAgentForm) => {
    createAgent.mutate({
      data: {
        name: data.name,
        mission: data.mission,
        personality: data.personality,
        tokenSymbol: data.tokenSymbol.toUpperCase(),
        firstTask: data.firstTask || undefined,
        memoryPublic: true,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {!showForm && (
        <section className="relative overflow-hidden border-b border-border/30">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary font-medium mb-6">
                <Zap className="w-3 h-3" />
                Turn ideas into economic organisms
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Launch your AI agent<br />
                <span className="text-primary">in 60 seconds</span>
              </h1>
              <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                Every agent has a brain, a token, a treasury, and a community.
                Watch it grow from egg to guild as people interact, tip, and vote.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  data-testid="button-create-agent"
                  size="lg"
                  onClick={() => setShowForm(true)}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Create an Agent
                </Button>
                <Button
                  data-testid="button-view-agents"
                  size="lg"
                  variant="outline"
                  onClick={() => document.getElementById("agents-grid")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Browse Agents
                </Button>
              </div>
              <div className="flex gap-6 mt-10 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-primary" />
                  AI-powered brain
                </div>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Bonding curve token
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Community governance
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {showForm && (
        <section className="max-w-xl mx-auto px-4 py-10">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Create your agent</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Define its identity and it will be live instantly.
            </p>
          </div>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
              data-testid="form-create-agent"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-agent-name"
                        placeholder="e.g. Scout, Nexus, Veritas"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tokenSymbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token Symbol</FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-token-symbol"
                        placeholder="e.g. SCOUT"
                        className="font-mono uppercase"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value.toUpperCase())
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mission</FormLabel>
                    <FormControl>
                      <Textarea
                        data-testid="input-mission"
                        placeholder="What is this agent's purpose? What problems will it solve?"
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personality</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-personality">
                          <SelectValue placeholder="Choose a personality archetype" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PERSONALITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value} data-testid={`option-personality-${p.label.toLowerCase()}`}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="firstTask"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Task <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input
                        data-testid="input-first-task"
                        placeholder="e.g. Find the best DeFi yield opportunities"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-3 pt-2">
                <Button
                  data-testid="button-submit-create"
                  type="submit"
                  disabled={createAgent.isPending}
                  className="flex-1"
                >
                  {createAgent.isPending ? "Launching…" : "🚀 Launch Agent"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </section>
      )}

      <section id="agents-grid" className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold" data-testid="heading-agents">
            {isLoading ? "Loading…" : `${agents.length} Agent${agents.length !== 1 ? "s" : ""}`}
          </h2>
          {!showForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="button-create-small"
            >
              + Create
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-xl bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="text-no-agents">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No agents yet</p>
            <p className="text-sm mt-1">Be the first to create one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
