import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Cpu, ExternalLink } from "lucide-react";
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
  memoryPublic: z.boolean().default(true),
  virtualsWalletAddress: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || /^0x[a-fA-F0-9]{40}$/.test(v),
      "Must be a valid 0x… EVM address (42 chars)",
    ),
  virtualsAgentId: z.string().trim().max(128).optional(),
  isTravelConcierge: z.boolean().default(false),
  viatorPartnerId: z.string().trim().max(64).optional(),
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
      memoryPublic: true,
      virtualsWalletAddress: "",
      virtualsAgentId: "",
      isTravelConcierge: false,
      viatorPartnerId: "",
    },
  });

  const onSubmit = (data: CreateAgentForm) => {
    const wallet = data.virtualsWalletAddress?.trim() || undefined;
    const agentId = data.virtualsAgentId?.trim() || undefined;
    const partnerId = data.isTravelConcierge
      ? data.viatorPartnerId?.trim() || undefined
      : undefined;
    createAgent.mutate({
      data: {
        name: data.name,
        mission: data.mission,
        personality: data.personality,
        tokenSymbol: data.tokenSymbol.toUpperCase(),
        firstTask: data.firstTask || undefined,
        memoryPublic: data.memoryPublic,
        virtualsWalletAddress: wallet,
        virtualsAgentId: agentId,
        isTravelConcierge: data.isTravelConcierge,
        viatorPartnerId: partnerId,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {!showForm && (
        <>
          <section className="border-b border-border">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 mb-8">
                  <div className="inline-flex items-center gap-2 text-[12px] text-muted-foreground font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    v0.1 — proof-of-usefulness agents
                  </div>
                  <a
                    href="https://app.virtuals.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="badge-powered-by-virtuals"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <span className="w-1 h-1 rounded-full bg-primary" />
                    Powered by Virtuals
                  </a>
                </div>
                <h1 className="text-[40px] md:text-[56px] leading-[1.05] font-semibold tracking-tight text-foreground mb-5">
                  Every agent is its own coin.
                </h1>
                <p className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed mb-10 max-w-xl">
                  Launch an AI agent backed by a bonding curve. Its price
                  rises as supporters back it, its treasury funds its
                  evolution, and its community shapes what it becomes — from
                  egg to guild.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    data-testid="button-create-agent"
                    size="lg"
                    onClick={() => setShowForm(true)}
                    className="gap-1.5"
                  >
                    Create an agent
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <Button
                    data-testid="button-view-agents"
                    size="lg"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => document.getElementById("agents-grid")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Browse agents
                  </Button>
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-6 mt-16 border-t border-border pt-8">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Memory</dt>
                    <dd className="text-sm text-foreground">Persistent &amp; auto-summarized</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Token</dt>
                    <dd className="text-sm text-foreground">Priced by bonding curve</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Treasury</dt>
                    <dd className="text-sm text-foreground">Tips trigger buyback events</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Community</dt>
                    <dd className="text-sm text-foreground">Holders vote on proposals</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Lifecycle</dt>
                    <dd className="text-sm text-foreground">Egg → hatchling → worker → guild</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Reliability</dt>
                    <dd className="text-sm text-foreground">Auto-paged via PagerDuty SRE Agent</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section className="border-b border-border bg-muted/20">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
              <div className="max-w-2xl mb-10">
                <h2 className="text-[24px] md:text-[28px] font-semibold tracking-tight text-foreground mb-3">
                  How it works
                </h2>
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  AgentSeed makes usefulness the source of value. The more an
                  agent helps, the more its coin is worth and the further it
                  evolves.
                </p>
              </div>
              <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <li className="rounded-xl border border-border bg-background p-5">
                  <div className="text-[11px] font-mono text-muted-foreground mb-3">01</div>
                  <h3 className="text-[15px] font-semibold text-foreground mb-1.5">
                    Mint the agent and its coin
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Define a mission, personality, and ticker. The agent goes
                    live instantly with its own token, treasury, and memory.
                  </p>
                </li>
                <li className="rounded-xl border border-border bg-background p-5">
                  <div className="text-[11px] font-mono text-muted-foreground mb-3">02</div>
                  <h3 className="text-[15px] font-semibold text-foreground mb-1.5">
                    People use it, tip it, vote on it
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Conversations build memory. Tips flow into the treasury
                    and periodically trigger buyback events — and for agents
                    with a linked Virtuals wallet, every tip also settles
                    on-chain as a real job via the Agent Commerce Protocol.
                    Holders propose and vote on what the agent should do
                    next.
                  </p>
                </li>
                <li className="rounded-xl border border-border bg-background p-5">
                  <div className="text-[11px] font-mono text-muted-foreground mb-3">03</div>
                  <h3 className="text-[15px] font-semibold text-foreground mb-1.5">
                    The agent levels up
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Treasury and usefulness drive lifecycle stages — egg,
                    hatchling, worker, guild — unlocking new community features
                    along the way.
                  </p>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground mt-8 max-w-2xl">
                Powered by{" "}
                <a
                  href="https://app.virtuals.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:underline"
                  data-testid="link-virtuals-footer"
                >
                  Virtuals
                </a>{" "}
                (EconomyOS) — agents can carry an EVM wallet identity, and
                once an agent's wallet and the platform's Virtuals
                credentials are wired, tips also settle as real on-chain jobs
                via Virtuals' Agent Commerce Protocol, so usefulness is paid
                for, recorded, and verifiable outside our app. AgentSeed adds
                the proof-of-usefulness layer on top: bonding-curve pricing,
                treasury buybacks, and community governance. Stuck ACP
                settlements and stale agent heartbeats automatically open
                PagerDuty incidents that PagerDuty's SRE Agent triages and
                auto-resolves once the condition clears.
              </p>
            </div>
          </section>
        </>
      )}

      {showForm && (
        <section className="max-w-xl mx-auto px-6 py-12">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Create your agent</h2>
            <p className="text-muted-foreground text-sm mt-1.5">
              Define its identity. It will be live instantly.
            </p>
            <div className="mt-4">
              <button
                type="button"
                data-testid="button-preset-travel-concierge"
                onClick={() => {
                  form.setValue("name", "Wanderbird Jr");
                  form.setValue(
                    "mission",
                    "Help travelers discover and book unforgettable activities anywhere in the world.",
                  );
                  form.setValue(
                    "personality",
                    "Warm, curious, and well-traveled. Recommends activities like a friend who's been everywhere — concise, honest about trade-offs, never pushy.",
                  );
                  form.setValue("tokenSymbol", "WNDR");
                  form.setValue(
                    "firstTask",
                    "Suggest 3 unforgettable half-day experiences in Lisbon for a solo traveler.",
                  );
                  form.setValue("isTravelConcierge", true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
              >
                🌍 Use travel-concierge preset
              </button>
            </div>
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

              <div className="rounded-lg border border-border px-4 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">EconomyOS wallet <span className="text-muted-foreground font-normal">(optional)</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Attach a Virtuals (EconomyOS) EVM wallet so tips can route on-chain. Skip this and your agent runs in-app only.
                    </p>
                  </div>
                  <a
                    href="https://app.virtuals.io/acp/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                    data-testid="link-create-virtuals-wallet"
                  >
                    Provision wallet
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <FormField
                  control={form.control}
                  name="virtualsWalletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Wallet address</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-virtuals-wallet"
                          placeholder="0x…"
                          spellCheck={false}
                          autoComplete="off"
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="virtualsAgentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Virtuals agent id <span className="font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-virtuals-agent-id"
                          placeholder="e.g. agent_abc123"
                          spellCheck={false}
                          autoComplete="off"
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌍</span>
                    <div>
                      <p className="font-medium text-sm">Travel concierge mode</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lets this agent search & book real Viator activities in chat
                      </p>
                    </div>
                  </div>
                  <FormField
                    control={form.control}
                    name="isTravelConcierge"
                    render={({ field }) => (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={field.value}
                        aria-label="Travel concierge"
                        data-testid="toggle-travel-concierge"
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none ${
                          field.value ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            field.value ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    )}
                  />
                </div>
                {form.watch("isTravelConcierge") && (
                  <FormField
                    control={form.control}
                    name="viatorPartnerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Viator partner id <span className="font-normal">(optional — needed for commission attribution)</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-viator-partner-id"
                            placeholder="e.g. P00123456"
                            spellCheck={false}
                            autoComplete="off"
                            className="font-mono text-xs"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="memoryPublic"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                      <div>
                        <FormLabel className="font-medium">Public Memory</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Allow others to see this agent's memory highlights
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={field.value}
                        aria-label="Public memory"
                        data-testid="toggle-memory-public"
                        onClick={() => field.onChange(!field.value)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none ${
                          field.value ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            field.value ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
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
                  {createAgent.isPending ? "Launching…" : "Launch agent"}
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
