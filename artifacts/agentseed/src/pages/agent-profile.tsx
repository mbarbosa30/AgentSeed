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
  Brain,
  QrCode,
  Lock,
  TrendingUp,
  Wallet,
  Copy,
  ExternalLink,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  useGetAgent,
  useGetAgentMessages,
  useGetAgentStats,
  useGetAgentVotes,
  useGetAgentSupporters,
  useGetAgentTips,
  useSubmitVote,
  useSendTip,
  useAddSupporter,
  useForkAgent,
  useCreateProposal,
  getGetAgentQueryKey,
  getGetAgentMessagesQueryKey,
  getGetAgentStatsQueryKey,
  getGetAgentVotesQueryKey,
  getGetAgentSupportersQueryKey,
  getGetAgentTipsQueryKey,
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

const VIRTUALS_CHAIN_ID = Number(import.meta.env.VITE_VIRTUALS_CHAIN_ID ?? 84532);
const explorerForChain = (chainId: number): string => {
  switch (chainId) {
    case 8453:
      return "https://basescan.org";
    case 84532:
    default:
      return "https://sepolia.basescan.org";
  }
};

type AcpStatusValue =
  | "none"
  | "created"
  | "budget_set"
  | "funded"
  | "submitted"
  | "completed"
  | "rejected"
  | "expired"
  | "failed";

const acpBadgeLabel = (status: AcpStatusValue | string): string => {
  switch (status) {
    case "completed":
      return "✓ settled";
    case "submitted":
      return "📦 submitted";
    case "funded":
      return "💰 funded";
    case "budget_set":
      return "🎯 budget";
    case "created":
      return "⚡ ACP";
    case "rejected":
      return "✗ rejected";
    case "expired":
      return "⏱ expired";
    case "failed":
      return "⚠ failed";
    default:
      return "⚡ ACP";
  }
};

const acpBadgeClass = (status: AcpStatusValue | string): string => {
  switch (status) {
    case "completed":
      return "bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400";
    case "rejected":
    case "failed":
    case "expired":
      return "bg-destructive/15 text-destructive hover:bg-destructive/25";
    default:
      return "bg-primary/10 text-primary hover:bg-primary/20";
  }
};

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
  const [showQr, setShowQr] = useState(false);
  const [newProposal, setNewProposal] = useState("");

  const profileUrl = typeof window !== "undefined"
    ? `${window.location.origin}/agent/${slug}`
    : `/agent/${slug}`;

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

  const { data: recentTips = [] } = useGetAgentTips(slug, {
    query: {
      queryKey: getGetAgentTipsQueryKey(slug),
      enabled: !!slug,
      // Poll every 8s while the page is open so judges see ACP status
      // (created → budget_set → funded → submitted → completed) update live.
      refetchInterval: 8000,
    },
  });

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  const submitVote = useSubmitVote({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentVotesQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
        toast({ title: "Vote cast!" });
      },
    },
  });

  const sendTip = useSendTip({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
        queryClient.invalidateQueries({ queryKey: getGetAgentTipsQueryKey(slug) });
        const extras: string[] = [];
        if (data.isBuybackTip) extras.push("🔥 Buyback burn triggered");
        if (data.lifecycleAdvanced) extras.push(`🌱 Evolved to ${data.lifecycleStage}`);
        if (data.acpJobId) extras.push(`⚡ EconomyOS job #${data.acpJobId}`);
        toast({
          title: `Tip sent! Treasury: ${data.treasuryBalance.toFixed(2)}`,
          description: extras.length > 0
            ? extras.join(" · ")
            : `${data.burnEvents} buyback burns so far`,
        });
      },
    },
  });

  const addSupporter = useAddSupporter({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(slug) });
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
      onError: () => {
        toast({ title: "Fork failed", description: "Only Guild-stage agents can be forked", variant: "destructive" });
      },
    },
  });

  const createProposal = useCreateProposal({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetAgentVotesQueryKey(slug) });
        setNewProposal("");
        toast({ title: "Proposal submitted!" });
      },
      onError: () => {
        toast({ title: "Failed to submit proposal", variant: "destructive" });
      },
    },
  });

  const handleNewMessage = (msg: AgentMessage) => {
    setLocalMessages((prev) => [...prev, msg]);
    if (msg.role === "assistant") {
      queryClient.invalidateQueries({ queryKey: getGetAgentStatsQueryKey(slug) });
      // Lifecycle stage / treasury / mood may have advanced server-side after this reply;
      // refetch the agent so the header badge and stats reflect the new stage immediately.
      queryClient.invalidateQueries({ queryKey: getGetAgentQueryKey(slug) });
    }
  };

  const isGuild = agent?.lifecycleStage === "guild";

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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-6 gap-1.5 -ml-2 text-muted-foreground hover:text-foreground font-normal"
          data-testid="button-back"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All agents
        </Button>

        <div className="mb-8">
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <h1 className="text-[28px] font-semibold tracking-tight" data-testid="text-agent-name">
              {agent.name}
            </h1>
            <span className="font-mono text-sm text-muted-foreground" data-testid="text-token-symbol">
              ${agent.tokenSymbol}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <LifecycleBadge stage={agent.lifecycleStage} />
            <MoodBadge mood={agent.mood} />
            {agent.parentSlug && (
              <span className="text-xs text-muted-foreground">
                · forked from{" "}
                <a
                  href={`/agent/${agent.parentSlug}`}
                  className="underline-offset-4 hover:underline text-foreground"
                  data-testid="link-parent"
                >
                  {agent.parentSlug}
                </a>
              </span>
            )}
          </div>

          <p className="text-[15px] text-muted-foreground leading-relaxed max-w-2xl mb-6" data-testid="text-mission">
            {agent.mission}
          </p>

          <div className="flex items-center justify-between gap-6 border-y border-border py-4">
            <div className="flex items-center gap-8 text-sm">
              <div data-testid="stat-treasury">
                <span className="font-mono text-foreground">
                  {(stats?.treasuryBalance ?? agent.treasuryBalance).toFixed(2)}
                </span>
                <span className="ml-1.5 text-muted-foreground text-xs">treasury</span>
              </div>
              <div data-testid="stat-holders">
                <span className="font-mono text-foreground">
                  {stats?.holderCount ?? agent.holderCount}
                </span>
                <span className="ml-1.5 text-muted-foreground text-xs">holders</span>
              </div>
              {stats && (
                <div data-testid="stat-usefulness">
                  <span className="font-mono text-foreground">{stats.usefulnessScore}</span>
                  <span className="ml-1.5 text-muted-foreground text-xs">usefulness</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px] hidden sm:inline">
                {profileUrl.replace(/^https?:\/\//, "")}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setShowQr((v) => !v)}
                title="Show QR code"
                data-testid="button-show-qr"
              >
                <QrCode className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {showQr && (
            <div className="mt-4 p-4 bg-card border border-border rounded-lg inline-block" data-testid="qr-code">
              <QRCodeSVG value={profileUrl} size={128} />
            </div>
          )}

          <div
            className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
            data-testid="row-economyos-identity"
          >
            <Wallet className="w-3.5 h-3.5 text-primary" />
            <span className="font-medium text-foreground">Identity by EconomyOS</span>
            {agent.virtualsWalletAddress ? (
              <>
                <span className="font-mono text-[11px] truncate max-w-[180px] sm:max-w-[260px]">
                  {agent.virtualsWalletAddress}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    void navigator.clipboard.writeText(agent.virtualsWalletAddress!);
                    toast({ title: "Wallet address copied" });
                  }}
                  title="Copy wallet address"
                  data-testid="button-copy-wallet"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <a
                  href={`${explorerForChain(VIRTUALS_CHAIN_ID)}/address/${agent.virtualsWalletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  data-testid="link-basescan"
                >
                  {VIRTUALS_CHAIN_ID === 8453 ? "Basescan" : "Basescan (Sepolia)"}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            ) : (
              <span className="italic">EconomyOS wallet pending — tips route in-app only.</span>
            )}
          </div>
        </div>

        <Tabs defaultValue="chat" className="w-full">
          <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 overflow-x-auto mb-4">
            <TabsList className="w-max">
              <TabsTrigger value="chat" data-testid="tab-chat">Chat</TabsTrigger>
              <TabsTrigger value="stats" data-testid="tab-stats">Stats</TabsTrigger>
              <TabsTrigger value="community" data-testid="tab-community">Community</TabsTrigger>
              <TabsTrigger value="fork" data-testid="tab-fork">Fork</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat">
            <Card className="h-[70vh] min-h-[420px] max-h-[640px] flex flex-col overflow-hidden">
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
                      <span className="text-muted-foreground">Tasks Completed</span>
                      <span className="font-medium">{stats.tasksCompleted}</span>
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
                      <span className="text-muted-foreground">Buyback Burns</span>
                      <span className="font-medium text-orange-400">{stats.buybackBurnEvents} 🔥</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Supporters</span>
                      <span className="font-medium">{stats.supporterCount}</span>
                    </div>
                    {stats.topVoteProposal && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Top Vote</span>
                        <span className="font-medium text-xs text-right max-w-[60%] truncate">{stats.topVoteProposal}</span>
                      </div>
                    )}
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

              <div className="space-y-4">
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      Bonding curve
                    </h3>
                    <span
                      className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                      data-testid="bonding-live-indicator"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  </div>
                  {stats?.bondingCurvePoints && (
                    <BondingCurve
                      points={stats.bondingCurvePoints}
                      currentSupply={stats.currentSupply}
                      currentPrice={stats.currentPrice}
                      treasuryBalance={stats.treasuryBalance}
                      holderCount={stats.holderCount}
                      tokenSymbol={agent.tokenSymbol}
                      isLive
                    />
                  )}
                  <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground space-y-1.5">
                    <div className="flex justify-between">
                      <span>Lifecycle</span>
                      <span className="font-medium capitalize text-foreground" data-testid="text-lifecycle-stage">{agent.lifecycleStage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Next stage at</span>
                      <span className="font-medium text-foreground" data-testid="text-next-stage">
                        {agent.lifecycleStage === "egg" ? "10 growth" :
                         agent.lifecycleStage === "hatchling" ? "50 growth" :
                         agent.lifecycleStage === "worker" ? "200 growth" :
                         "Max level"}
                      </span>
                    </div>
                    {agent.lifecycleStage !== "guild" && stats && (
                      <div className="flex justify-between text-[10px] opacity-70">
                        <span>Growth = msgs + 10·holders + 5·tips</span>
                        <span className="font-mono">
                          {stats.totalMessages + (stats.holderCount ?? agent.holderCount) * 10 + stats.tipsReceived * 5}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>

                {stats && (stats.memoryHighlights?.length ?? 0) > 0 && (
                  <Card className="p-5">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-violet-400" />
                      Memory Highlights
                    </h3>
                    <div className="space-y-2">
                      {stats.memoryHighlights!.map((h, i) => (
                        <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
                          {h}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
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
                  <p className="text-xs text-muted-foreground mb-3">
                    Proposals with 5+ votes become memory highlights that shape the agent's behavior
                  </p>
                  <div className="flex gap-2 mb-3">
                    <Input
                      data-testid="input-new-proposal"
                      placeholder="Propose a new mission or tool unlock…"
                      value={newProposal}
                      onChange={(e) => setNewProposal(e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      data-testid="button-submit-proposal"
                      disabled={createProposal.isPending || newProposal.trim().length < 5}
                      onClick={() => createProposal.mutate({ slug, data: { proposal: newProposal.trim() } })}
                    >
                      Propose
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {votes.map((vote) => (
                      <div
                        key={vote.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                        data-testid={`vote-${vote.id}`}
                      >
                        <div className="flex-1 mr-2">
                          <span className="text-sm">{vote.proposal}</span>
                          {vote.voteCount >= 5 && (
                            <span className="ml-2 text-xs text-violet-400">✓ in memory</span>
                          )}
                        </div>
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
                    Every 5th tip triggers a 20% buyback burn 🔥
                  </p>
                  <p
                    className="text-[11px] text-muted-foreground mt-1 italic"
                    data-testid="text-treasury-virtuals"
                  >
                    {agent.virtualsWalletAddress
                      ? "Settlement powered by Virtuals — Agent Commerce Protocol on Base."
                      : "Powered by Virtuals — wire an EconomyOS wallet to route tips on Base."}
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

                <Card className="p-4">
                  <h3 className="font-semibold mb-1 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-accent" />
                    Recent tips
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Last 20 tips. Tips routed through EconomyOS show an on-chain ACP job id.
                  </p>
                  <div className="space-y-2" data-testid="recent-tips-list">
                    {recentTips.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0"
                        data-testid={`tip-${t.id}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-muted-foreground">
                            {t.fromHandle ? `@${t.fromHandle}` : "anon"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {new Date(t.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-accent">{t.amount} tkn</span>
                          {t.acpJobId ? (
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(String(t.acpJobId));
                                toast({ title: `Copied ACP job #${t.acpJobId}` });
                              }}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1 ${acpBadgeClass(t.acpStatus)}`}
                              data-testid={`acp-job-${t.id}`}
                              title={`EconomyOS ACP job ${t.acpJobId} · status: ${t.acpStatus} · chain ${t.acpChainId ?? VIRTUALS_CHAIN_ID} — click to copy id`}
                            >
                              {acpBadgeLabel(t.acpStatus)} #{String(t.acpJobId).slice(0, 6)}
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          ) : (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                              title="In-app tip (EconomyOS routing not configured at tip time)"
                            >
                              in-app
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {recentTips.length === 0 && (
                      <p className="text-sm text-muted-foreground">No tips yet.</p>
                    )}
                  </div>
                </Card>

                <Card className="p-4 flex gap-3 items-start">
                  <QrCode className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium mb-1">Share this agent</p>
                    <p className="text-xs text-muted-foreground mb-2 font-mono break-all">{profileUrl}</p>
                    <div className="bg-white rounded-lg p-2 inline-block">
                      <QRCodeSVG value={profileUrl} size={100} />
                    </div>
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

              {!isGuild ? (
                <div className="mt-4 flex flex-col items-center text-center py-8 gap-3">
                  <Lock className="w-10 h-10 text-muted-foreground opacity-40" />
                  <p className="text-muted-foreground font-medium">Guild Stage Required</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Forking is unlocked when {agent.name} reaches{" "}
                    <span className="text-primary font-semibold">Guild</span> stage — at least 200 messages
                    or 50 holders. Current stage:{" "}
                    <span className="capitalize font-semibold">{agent.lifecycleStage}</span>.
                  </p>
                </div>
              ) : (
                <>
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
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

