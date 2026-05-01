import { logger } from "./logger";

export type AcpTipResult = {
  jobId: string;
  chainId: number;
};

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
};

type AcpConfig = {
  walletAddress: string;
  walletId: string;
  signerPrivateKey: string;
  builderCode?: string;
  chainId: number;
};

function readConfig(): AcpConfig | null {
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

let cachedAgent: AcpAgentInstance | null = null;
let initPromise: Promise<AcpAgentInstance | null> | null = null;

async function getAgent(config: AcpConfig): Promise<AcpAgentInstance | null> {
  if (cachedAgent) return cachedAgent;
  if (initPromise) return initPromise;

  initPromise = (async () => {
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
          { chainId: config.chainId },
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
        { walletAddress: config.walletAddress, chainId: config.chainId },
        "ACP platform agent initialized",
      );

      cachedAgent = agent as unknown as AcpAgentInstance;
      return cachedAgent;
    } catch (err) {
      logger.error({ err }, "ACP: failed to initialize platform agent");
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function isAcpConfigured(): boolean {
  return readConfig() !== null;
}

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Create a real Virtuals ACP fund-transfer job representing a tip.
 *
 * ACP role mapping (per Virtuals' freeform fund-transfer pattern):
 *   - Client    = the platform agent that calls `createFundTransferJob`
 *                 (this is implicit: the AcpAgent we initialize from
 *                 VIRTUALS_PLATFORM_* env vars).
 *   - Provider  = the AgentSeed agent receiving the tip → `providerAddress`.
 *   - Evaluator = the platform self-evaluates this freeform job (no human
 *                 reviewer at the demo stage) → reuse `walletAddress`.
 *   The downstream multi-step settlement (setBudget → fund → submit →
 *   complete) is intentionally out of scope here and handled via the `acp`
 *   CLI off-band; we only persist the on-chain job id.
 *
 * Returns null when:
 *   - platform credentials are not configured (free-tier / not onboarded), OR
 *   - the agent does not yet have a Virtuals wallet attached, OR
 *   - the wallet address is not a syntactically valid EVM address, OR
 *   - the SDK call fails for any reason (network, quota, etc).
 *
 * Failures are logged but never thrown — tips must always succeed in-app even
 * when the on-chain hop is unavailable.
 */
export async function tryCreateTipJob(args: {
  agentWalletAddress: string | null;
  fromHandle: string | null;
  amount: number;
  agentName: string;
}): Promise<AcpTipResult | null> {
  const config = readConfig();
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
    const agent = await getAgent(config);
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
