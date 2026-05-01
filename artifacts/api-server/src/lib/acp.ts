import { logger } from "./logger";

export type AcpTipResult = {
  jobId: string;
  chainId: number;
};

export type AcpJobStatus =
  | "none"
  | "created"
  | "budget_set"
  | "funded"
  | "submitted"
  | "completed"
  | "rejected"
  | "expired"
  | "failed";

const TERMINAL_STATUSES = new Set<AcpJobStatus>([
  "completed",
  "rejected",
  "expired",
  "failed",
  "none",
]);

export function isTerminalAcpStatus(s: AcpJobStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

type AssetTokenInstance = unknown;

type AcpAgentInstance = {
  createFundTransferJob: (
    chainId: number,
    params: {
      providerAddress: string;
      evaluatorAddress: string;
      expiredAt: number;
      description: string;
    },
  ) => Promise<bigint>;
  internalSetBudget: (
    chainId: number,
    params: { jobId: bigint; amount: AssetTokenInstance },
  ) => Promise<string | string[]>;
  internalFund: (
    chainId: number,
    params: { jobId: bigint; expectedBudget: bigint },
  ) => Promise<string | string[]>;
  internalSubmit: (
    chainId: number,
    params: { jobId: bigint; deliverable: string },
  ) => Promise<string | string[]>;
  internalComplete: (
    chainId: number,
    params: { jobId: bigint; reason: string },
  ) => Promise<string | string[]>;
};

type AcpConfig = {
  walletAddress: string;
  walletId: string;
  signerPrivateKey: string;
  builderCode?: string;
  chainId: number;
};

function readPlatformConfig(): AcpConfig | null {
  const walletAddress = process.env.VIRTUALS_PLATFORM_WALLET_ADDRESS;
  const walletId = process.env.VIRTUALS_PLATFORM_WALLET_ID;
  const signerPrivateKey = process.env.VIRTUALS_PLATFORM_SIGNER_KEY;
  const chainId = Number(process.env.VIRTUALS_CHAIN_ID ?? 84532);

  if (!walletAddress || !walletId || !signerPrivateKey || !Number.isFinite(chainId)) {
    return null;
  }

  return {
    walletAddress,
    walletId,
    signerPrivateKey,
    builderCode: process.env.VIRTUALS_BUILDER_CODE,
    chainId,
  };
}

/**
 * Read provider (recipient agent) credentials. For the demo we support a
 * single configured provider — the seeded Scout agent — via env vars. Other
 * agents fall through to a "no provider signer available" graceful state and
 * their tips stay in the `created` ACP status (no auto-settlement).
 */
function readProviderConfig(): AcpConfig | null {
  const walletAddress = process.env.VIRTUALS_PROVIDER_WALLET_ADDRESS;
  const walletId = process.env.VIRTUALS_PROVIDER_WALLET_ID;
  const signerPrivateKey = process.env.VIRTUALS_PROVIDER_SIGNER_KEY;
  const chainId = Number(process.env.VIRTUALS_CHAIN_ID ?? 84532);

  if (!walletAddress || !walletId || !signerPrivateKey || !Number.isFinite(chainId)) {
    return null;
  }

  return {
    walletAddress,
    walletId,
    signerPrivateKey,
    builderCode: process.env.VIRTUALS_BUILDER_CODE,
    chainId,
  };
}

type AgentCache = {
  agent: AcpAgentInstance | null;
  promise: Promise<AcpAgentInstance | null> | null;
};
const cache: Record<"platform" | "provider", AgentCache> = {
  platform: { agent: null, promise: null },
  provider: { agent: null, promise: null },
};

async function getAgent(
  role: "platform" | "provider",
  config: AcpConfig,
): Promise<AcpAgentInstance | null> {
  const slot = cache[role];
  if (slot.agent) return slot.agent;
  if (slot.promise) return slot.promise;

  slot.promise = (async () => {
    try {
      const sdk = await import("@virtuals-protocol/acp-node-v2");
      const accountKit = await import("@account-kit/infra");
      const chain =
        config.chainId === 8453
          ? accountKit.base
          : config.chainId === 84532
            ? accountKit.baseSepolia
            : null;
      if (!chain) {
        logger.warn(
          { chainId: config.chainId, role },
          "ACP: unsupported VIRTUALS_CHAIN_ID, skipping integration",
        );
        return null;
      }

      const provider = await sdk.PrivyAlchemyEvmProviderAdapter.create({
        walletAddress: config.walletAddress as `0x${string}`,
        walletId: config.walletId,
        chains: [chain],
        signerPrivateKey: config.signerPrivateKey as `0x${string}`,
        builderCode: config.builderCode,
      });

      const agent = await sdk.AcpAgent.create({ provider });
      logger.info(
        { walletAddress: config.walletAddress, chainId: config.chainId, role },
        `ACP ${role} agent initialized`,
      );

      slot.agent = agent as unknown as AcpAgentInstance;
      return slot.agent;
    } catch (err) {
      logger.error({ err, role }, "ACP: failed to initialize agent");
      return null;
    } finally {
      slot.promise = null;
    }
  })();

  return slot.promise;
}

export function isAcpConfigured(): boolean {
  return readPlatformConfig() !== null;
}

export function isAutosettleEnabled(): boolean {
  if (process.env.VIRTUALS_AUTOSETTLE_ENABLED !== "true") return false;
  return readPlatformConfig() !== null && readProviderConfig() !== null;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Create a real Virtuals ACP fund-transfer job representing a tip.
 *
 * ACP role mapping (per Virtuals' freeform fund-transfer pattern):
 *   - Client    = the platform agent that calls `createFundTransferJob`.
 *   - Provider  = the AgentSeed agent receiving the tip → `providerAddress`.
 *   - Evaluator = the platform self-evaluates this freeform job.
 *
 * Returns null when:
 *   - platform credentials are not configured, OR
 *   - the agent does not yet have a Virtuals wallet attached, OR
 *   - the wallet address is not a syntactically valid EVM address, OR
 *   - the SDK call fails for any reason.
 *
 * Failures are logged but never thrown — tips must always succeed in-app.
 */
export async function tryCreateTipJob(args: {
  agentWalletAddress: string | null;
  fromHandle: string | null;
  amount: number;
  agentName: string;
}): Promise<AcpTipResult | null> {
  const config = readPlatformConfig();
  if (!config) return null;
  if (!args.agentWalletAddress) return null;
  if (!EVM_ADDRESS_RE.test(args.agentWalletAddress)) {
    logger.warn(
      { agentWallet: args.agentWalletAddress },
      "ACP: agent wallet address is not a valid EVM address; skipping ACP hop",
    );
    return null;
  }
  if (!Number.isFinite(args.amount) || args.amount <= 0 || args.amount > 1_000_000) {
    return null;
  }

  try {
    const agent = await getAgent("platform", config);
    if (!agent) return null;

    const description =
      `Tip from ${args.fromHandle ?? "anonymous supporter"} ` +
      `to ${args.agentName} on AgentSeed (${args.amount.toFixed(2)} units).`;

    const jobId = await agent.createFundTransferJob(config.chainId, {
      providerAddress: args.agentWalletAddress,
      evaluatorAddress: config.walletAddress,
      expiredAt: Math.floor(Date.now() / 1000) + 3600,
      description,
    });

    return { jobId: jobId.toString(), chainId: config.chainId };
  } catch (err) {
    logger.error(
      { err, agentWallet: args.agentWalletAddress },
      "ACP: createFundTransferJob failed; tip recorded in-app only",
    );
    return null;
  }
}

/**
 * Convert an in-app tip amount (abstract "tip tokens") to a USDC AssetToken
 * instance via the SDK. Defaults to 0.001 USDC per tip token so the demo
 * doesn't move meaningful funds; override with `VIRTUALS_TIP_USDC_PER_TOKEN`.
 */
async function buildUsdcAmount(
  sdk: typeof import("@virtuals-protocol/acp-node-v2"),
  chainId: number,
  tipAmount: number,
): Promise<{ asset: AssetTokenInstance; rawAmount: bigint } | null> {
  const perToken = Number(process.env.VIRTUALS_TIP_USDC_PER_TOKEN ?? "0.001");
  if (!Number.isFinite(perToken) || perToken <= 0) return null;
  const usdc = Number((tipAmount * perToken).toFixed(6));
  if (usdc <= 0) return null;
  const asset = sdk.AssetToken.usdc(usdc, chainId) as unknown as AssetTokenInstance;
  // USDC has 6 decimals across Base and Base Sepolia.
  const rawAmount = BigInt(Math.round(usdc * 1_000_000));
  return { asset, rawAmount };
}

/**
 * Advance one tip-job step. Returns the new status, or null if no change.
 *
 * Each invocation performs a single on-chain hop and yields, so the worker
 * can space transactions out and observe real Basescan confirmations. The
 * status machine only moves forward; on failure we log and return null
 * (the row is left at its current status for the next poll to retry).
 *
 * IMPORTANT: This is fully gated by `VIRTUALS_AUTOSETTLE_ENABLED=true` so the
 * default behavior remains "create job id only, settle off-band via the
 * `acp` CLI" — judges have to opt into automatic settlement explicitly.
 */
export async function tryAdvanceTipJob(args: {
  jobId: string;
  currentStatus: AcpJobStatus;
  agentWalletAddress: string | null;
  amount: number;
}): Promise<AcpJobStatus | null> {
  if (isTerminalAcpStatus(args.currentStatus)) return null;
  if (!isAutosettleEnabled()) return null;

  const platformCfg = readPlatformConfig();
  const providerCfg = readProviderConfig();
  if (!platformCfg || !providerCfg) return null;

  // Only auto-settle when the recipient wallet matches the configured
  // provider wallet — otherwise we don't have its signer.
  if (
    !args.agentWalletAddress ||
    args.agentWalletAddress.toLowerCase() !== providerCfg.walletAddress.toLowerCase()
  ) {
    return null;
  }

  let jobIdBig: bigint;
  try {
    jobIdBig = BigInt(args.jobId);
  } catch {
    logger.warn({ jobId: args.jobId }, "ACP: invalid jobId, cannot advance");
    return "failed";
  }

  try {
    const sdk = await import("@virtuals-protocol/acp-node-v2");
    const platform = await getAgent("platform", platformCfg);
    const provider = await getAgent("provider", providerCfg);
    if (!platform || !provider) return null;

    const usdc = await buildUsdcAmount(sdk, platformCfg.chainId, args.amount);
    if (!usdc) return null;

    switch (args.currentStatus) {
      case "created": {
        await platform.internalSetBudget(platformCfg.chainId, {
          jobId: jobIdBig,
          amount: usdc.asset,
        });
        return "budget_set";
      }
      case "budget_set": {
        await platform.internalFund(platformCfg.chainId, {
          jobId: jobIdBig,
          expectedBudget: usdc.rawAmount,
        });
        return "funded";
      }
      case "funded": {
        await provider.internalSubmit(platformCfg.chainId, {
          jobId: jobIdBig,
          deliverable: "tip-acknowledged",
        });
        return "submitted";
      }
      case "submitted": {
        await platform.internalComplete(platformCfg.chainId, {
          jobId: jobIdBig,
          reason: "Tip settled by AgentSeed platform.",
        });
        return "completed";
      }
      default:
        return null;
    }
  } catch (err) {
    logger.error(
      { err, jobId: args.jobId, status: args.currentStatus },
      "ACP: settlement step failed; will retry on next poll",
    );
    return null;
  }
}
