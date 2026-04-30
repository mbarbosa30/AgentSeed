import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  Coins,
  GitFork,
  ThumbsUp,
  Trophy,
  Users,
  Zap,
  ChevronUp,
  Heart,
} from "lucide-react";
import {
  useGetAgent,
  useGetAgentMessages,
  useGetAgentStats,
  useGetAgentVotes,
  useGetAgentSupporters,
  useSubmitVote,
  useSendTip,
  useAddSupporter,
  useForkAgent,
  getGetAgentQueryKey,
  getGetAgentMessagesQueryKey,
  getGetAgentStatsQueryKey,
  getGetAgentVotesQueryKey,
  getGetAgentSupportersQueryKey,
  type AgentMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/navbar";
import { ChatInterface } from "@/components/chat-interface";
import { LifecycleBadge, MoodBadge } from "@/components/lifecycle-badge";
import { BondingCurve } from "@/components/bonding-curve";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const apiBase = import.meta.env.VITE_API_URL ?? "";

export default function AgentProfile() {
  const [, params] = useRoute("/agent/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [localMessages, setLocalMessages] = useState<AgentMessage[]>([]);
  const [tipAmount, setTipAmount] = useState("10");
  const [supporterNick, setSupporterNick] = useState("");
  const [forkName, setForkName] = useState("");
  const [forkToken, setForkToken] = useState("");
  const [forkMission, setForkMission] = useState("");
  const [forkSpec, setForkSpec] = useState("");
  const [showFork, setShowFork] = useState(false);

  const { data: agent, isLoading: agentLoading } = useGetAgent(slug, {
    query: { queryKey: getGetAgentQueryKey(slug) },
  });

  const { data: messages = [] } = useGetAgentMessages(slug, undefined, {
    query: {
      queryKey: getGetAgentMessagesQueryKey(slug, undefined),
      enabled: !!slug,
    },
  });

  const { data: stats } = useGetAgentStats(slug, {
    query: {
      queryKey: getGetAgentStatsQueryKey(slug),
      enabled: !!slug,
      refetchInterval: 10_000,
    },
  });

  const { data: votes = [] } = useGetAgentVotes(slug, {
    query: {
      queryKey: getGetAgentVotesQueryKey(slug),
      enabled: !!slug,
    },
  });

  const { data: supporters = [] } = useGetAgentSupporters(slug, {
    query: {
      queryKey: getGetAgentSupportersQueryKey(slug),
      enabled: !!slug,
    },
  });

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  const submitVote = useSubmitVote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentVotesQueryKey(slug) });
        toast({ title: "Vote cast!" });
      },
    },
  });

  const sendTip = useSendTip({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
        toast({
          title: `Tip sent! Treasury: ${data.treasuryBalance.toFixed(2)}`,
          description: `${data.burnEvents} burn events so far`,
        });
      },
    },
  });

  const addSupporter = useAddSupporter({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentSupportersQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
        setSupporterNick("");
        toast({ title: "You're now a supporter!" });
      },
    },
  });

  const forkAgent = useForkAgent({
    mutation: {
      onSuccess: (child) => {
        toast({ title: `${child.name} forked!`, description: `$${child.tokenSymbol} created` });
        setLocation(`/agent/${child.slug}`);
      },
    },
  });

  const handleNewMessage = (msg: AgentMessage) => {
    setLocalMessages((prev) => [...prev, msg]);
    if (msg.role === "assistant") {
      queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
    }
  };

  if (agentLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="h-8 w-48 bg-muted/30 rounded animate-pulse mb-4" />
          <div className="h-4 w-96 bg-muted/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-5xl mx-auto px-4 py-20 text-center">
          <p className="text-muted-foreground" data-testid="text-not-found">Agent not found</p>
          <Button className="mt-4" onClick={() => setLocation("/")} variant="outline">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-4 gap-1.5 -ml-2"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4" />
          All Agents
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-agent-name">{agent.name}</h1>
              <span className="font-mono text-lg text-accent font-bold" data-testid="text-token-symbol">
                ${agent.tokenSymbol}
              </span>
              <LifecycleBadge stage={agent.lifecycleStage} size="md" />
              <MoodBadge mood={agent.mood} size="md" />
            </div>
            <p className="text-muted-foreground mt-1 max-w-xl" data-testid="text-mission">
              {agent.mission}
            </p>
            {agent.parentSlug && (
              <p className="text-xs text-muted-foreground mt-1">
                Forked from{" "}
                <a
                  href={`/agent/${agent.parentSlug}`}
                  className="text-primary hover:underline"
                  data-testid="link-parent"
                >
                  {agent.parentSlug}
                </a>
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="flex flex-col items-center bg-card border border-border rounded-xl px-4 py-2" data-testid="stat-treasury">
              <Coins className="w-4 h-4 text-accent mb-0.5" />
              <span className="font-bold text-accent">{agent.treasuryBalance.toFixed(2)}</span>
              <span className="text-muted-foreground text-xs">treasury</span>
            </div>
            <div className="flex flex-col items-center bg-card border border-border rounded-xl px-4 py-2" data-testid="stat-holders">
              <Users className="w-4 h-4 text-primary mb-0.5" />
              <span className="font-bold">{agent.holderCount}</span>
              <span className="text-muted-foreground text-xs">holders</span>
            </div>
            {stats && (
              <div className="flex flex-col items-center bg-card border border-border rounded-xl px-4 py-2" data-testid="stat-usefulness">
                <Trophy className="w-4 h-4 text-yellow-400 mb-0.5" />
                <span className="font-bold">{stats.usefulnessScore}</span>
                <span className="text-muted-foreground text-xs">score</span>
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="chat" data-testid="tab-chat">Chat</TabsTrigger>
            <TabsTrigger value="stats" data-testid="tab-stats">Stats</TabsTrigger>
            <TabsTrigger value="community" data-testid="tab-community">Community</TabsTrigger>
            <TabsTrigger value="fork" data-testid="tab-fork">Fork</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            <Card className="h-[520px] flex flex-col overflow-hidden">
              <ChatInterface
                slug={slug}
                messages={localMessages}
                onNewMessage={handleNewMessage}
                apiBase={apiBase}
              />
            </Card>
          </TabsContent>

          <TabsContent value="stats">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Proof-of-Usefulness
                </h3>
                {stats ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Messages</span>
                      <span className="font-medium" data-testid="stat-total-messages">{stats.totalMessages}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Unique Sessions</span>
                      <span className="font-medium">{stats.uniqueSessions}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tips Received</span>
                      <span className="font-medium">{stats.tipsReceived}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Tips</span>
                      <span className="font-medium text-accent">{stats.totalTipAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Supporters</span>
                      <span className="font-medium">{stats.supporterCount}</span>
                    </div>
                    <div className="border-t border-border pt-3 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Usefulness Score</span>
                        <span className="font-bold text-primary text-lg">{stats.usefulnessScore}</span>
                      </div>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(stats.usefulnessScore, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">Loading stats…</div>
                )}
              </Card>

              <Card className="p-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  Bonding Curve
                </h3>
                {stats?.bondingCurvePoints && (
                  <BondingCurve
                    points={stats.bondingCurvePoints}
                    currentSupply={stats.supporterCount + agent.holderCount}
                  />
                )}
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Lifecycle</span>
                    <span className="font-medium capitalize">{agent.lifecycleStage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next stage at</span>
                    <span className="font-medium">
                      {agent.lifecycleStage === "egg" ? "5 msgs" :
                       agent.lifecycleStage === "hatchling" ? "50 msgs / 10 holders" :
                       agent.lifecycleStage === "worker" ? "200 msgs / 50 holders" :
                       "Max level"}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="community">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Card className="p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <ThumbsUp className="w-4 h-4 text-primary" />
                    Governance Votes
                  </h3>
                  <div className="space-y-2">
                    {votes.map((vote) => (
                      <div
                        key={vote.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                        data-testid={`vote-${vote.id}`}
                      >
                        <span className="text-sm flex-1 mr-2">{vote.proposal}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">{vote.voteCount}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            disabled={submitVote.isPending}
                            onClick={() =>
                              submitVote.mutate({ slug, data: { proposalId: vote.id } })
                            }
                            data-testid={`button-vote-${vote.id}`}
                          >
                            <ChevronUp className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {votes.length === 0 && (
                      <p className="text-sm text-muted-foreground">No proposals yet</p>
                    )}
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-accent" />
                    Send Tip
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      data-testid="input-tip-amount"
                      type="number"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      min={1}
                      className="w-24"
                    />
                    <Button
                      data-testid="button-send-tip"
                      onClick={() =>
                        sendTip.mutate({
                          slug,
                          data: { amount: Number(tipAmount) },
                        })
                      }
                      disabled={sendTip.isPending || !tipAmount}
                      className="flex-1"
                    >
                      {sendTip.isPending ? "Sending…" : "💸 Tip Treasury"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    10% is burned, 90% goes to treasury
                  </p>
                </Card>
              </div>

              <div className="space-y-4">
                <Card className="p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-pink-400" />
                    Become a Supporter
                  </h3>
                  <div className="flex gap-2 mb-4">
                    <Input
                      data-testid="input-supporter-name"
                      placeholder="Your handle"
                      value={supporterNick}
                      onChange={(e) => setSupporterNick(e.target.value)}
                    />
                    <Button
                      data-testid="button-add-supporter"
                      onClick={() =>
                        addSupporter.mutate({
                          slug,
                          data: { nickname: supporterNick, tokens: 100 },
                        })
                      }
                      disabled={addSupporter.isPending || !supporterNick.trim()}
                    >
                      {addSupporter.isPending ? "…" : "Back"}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {supporters.slice(0, 8).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between text-sm"
                        data-testid={`supporter-${s.id}`}
                      >
                        <span className="text-muted-foreground">@{s.nickname}</span>
                        <span className="font-mono text-xs text-accent">{s.tokens} tkn</span>
                      </div>
                    ))}
                    {supporters.length === 0 && (
                      <p className="text-sm text-muted-foreground">No supporters yet — be the first!</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fork">
            <Card className="p-6 max-w-lg">
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                <GitFork className="w-4 h-4 text-primary" />
                Fork {agent.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                Create a specialized child agent that inherits {agent.name}'s personality.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Child Agent Name</label>
                  <Input
                    data-testid="input-fork-name"
                    placeholder="e.g. Scout DeFi"
                    value={forkName}
                    onChange={(e) => setForkName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Token Symbol</label>
                  <Input
                    data-testid="input-fork-token"
                    placeholder="e.g. SDEFI"
                    value={forkToken}
                    onChange={(e) => setForkToken(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">New Mission</label>
                  <Input
                    data-testid="input-fork-mission"
                    placeholder="What will this fork focus on?"
                    value={forkMission}
                    onChange={(e) => setForkMission(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Specialization</label>
                  <Input
                    data-testid="input-fork-spec"
                    placeholder="e.g. DeFi yield strategies, NFT curation"
                    value={forkSpec}
                    onChange={(e) => setForkSpec(e.target.value)}
                  />
                </div>
                <Button
                  data-testid="button-fork-submit"
                  onClick={() =>
                    forkAgent.mutate({
                      slug,
                      data: {
                        name: forkName,
                        tokenSymbol: forkToken,
                        mission: forkMission,
                        specialization: forkSpec,
                      },
                    })
                  }
                  disabled={
                    forkAgent.isPending ||
                    !forkName.trim() ||
                    !forkToken.trim() ||
                    !forkMission.trim() ||
                    !forkSpec.trim()
                  }
                  className="w-full"
                >
                  {forkAgent.isPending ? "Forking…" : `🍴 Fork ${agent.name}`}
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function TrendingUp({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
