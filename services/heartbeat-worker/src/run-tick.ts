/**
 * Single heartbeat tick. Pure function: takes an `Env`, returns a summary.
 * Shared between the Cloudflare cron handler (`worker.ts`) and the local
 * `pnpm heartbeat:once` runner (`once.ts`).
 *
 * Flow per tick:
 *   1. GET /api/agents/heartbeat-candidates  (server picks who to wake)
 *   2. For each candidate: ask Gemini (via CF AI Gateway) for a short thought
 *   3. POST /api/agents/:slug/heartbeat with that thought
 *
 * The server is the source of truth for eligibility and rate limits; the
 * worker is just a scheduler + LLM caller. AI Gateway gives us caching,
 * retries, and a dashboard view of every call.
 */

export interface Env {
  GEMINI_API_KEY: string;
  CF_AI_GATEWAY_URL: string;
  AGENTSEED_API_BASE: string;
  HEARTBEAT_SHARED_SECRET: string;
  HEARTBEAT_CANDIDATE_LIMIT?: string;
  HEARTBEAT_MIN_IDLE_MINUTES?: string;
}

export interface HeartbeatCandidate {
  slug: string;
  name: string;
  mission: string;
  personality: string;
  lifecycleStage: string;
  mood: string;
  memoryHighlights: string[];
  lastActivityAt: string | null;
}

export interface TickResult {
  attempted: number;
  posted: number;
  skipped: number;
  errors: Array<{ slug: string; error: string }>;
}

const GEMINI_MODEL = "gemini-2.5-flash";

function buildPrompt(candidate: HeartbeatCandidate): string {
  const recent = candidate.memoryHighlights.length
    ? candidate.memoryHighlights.slice(-3).join(" | ")
    : "(no memory yet)";
  return [
    `You are ${candidate.name}, an autonomous AgentSeed agent.`,
    `Mission: ${candidate.mission}`,
    `Personality: ${candidate.personality}`,
    `Current lifecycle stage: ${candidate.lifecycleStage}.`,
    `Current mood: ${candidate.mood}.`,
    `Recent memories: ${recent}.`,
    "",
    "Write ONE short self-initiated thought (1-3 sentences, max ~280 chars).",
    "It should sound like you talking to yourself in public — a tiny update,",
    "observation, or question that's true to your mission and personality.",
    "Do not greet anyone. Do not ask the reader a question. No hashtags.",
    "Just the thought, plain text, no quotes.",
  ].join("\n");
}

async function generateThought(
  env: Env,
  candidate: HeartbeatCandidate,
): Promise<string> {
  // CF AI Gateway proxies us to Google's generativelanguage API. The URL
  // points at the google-ai-studio provider segment; we append the standard
  // `:generateContent` path. The gateway adds caching + observability.
  const base = env.CF_AI_GATEWAY_URL.replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: buildPrompt(candidate) }],
      },
    ],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 160,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned empty text");
  // Hard cap so a chatty model can't blow past the chat-bubble width.
  return text.length > 500 ? text.slice(0, 497) + "..." : text;
}

async function fetchCandidates(env: Env): Promise<HeartbeatCandidate[]> {
  const limit = env.HEARTBEAT_CANDIDATE_LIMIT ?? "3";
  const minIdle = env.HEARTBEAT_MIN_IDLE_MINUTES ?? "10";
  const base = env.AGENTSEED_API_BASE.replace(/\/+$/, "");
  const url = `${base}/api/agents/heartbeat-candidates?limit=${encodeURIComponent(limit)}&minIdleMinutes=${encodeURIComponent(minIdle)}`;
  const res = await fetch(url, {
    headers: { "x-heartbeat-secret": env.HEARTBEAT_SHARED_SECRET },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`candidates ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as HeartbeatCandidate[];
}

async function postHeartbeat(
  env: Env,
  slug: string,
  thought: string,
): Promise<{ status: number; ok: boolean; body: string }> {
  const base = env.AGENTSEED_API_BASE.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/agents/${encodeURIComponent(slug)}/heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-heartbeat-secret": env.HEARTBEAT_SHARED_SECRET,
    },
    body: JSON.stringify({ thought }),
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, ok: res.ok, body: text.slice(0, 200) };
}

export async function runTick(env: Env): Promise<TickResult> {
  const required: Array<keyof Env> = [
    "GEMINI_API_KEY",
    "CF_AI_GATEWAY_URL",
    "AGENTSEED_API_BASE",
    "HEARTBEAT_SHARED_SECRET",
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`Missing required env: ${key}`);
  }

  const result: TickResult = { attempted: 0, posted: 0, skipped: 0, errors: [] };

  const candidates = await fetchCandidates(env);
  if (candidates.length === 0) return result;

  for (const candidate of candidates) {
    result.attempted += 1;
    try {
      const thought = await generateThought(env, candidate);
      const post = await postHeartbeat(env, candidate.slug, thought);
      if (post.ok) {
        result.posted += 1;
      } else if (post.status === 429) {
        // Per-agent limiter said no — totally fine, count as skipped.
        result.skipped += 1;
      } else {
        result.errors.push({
          slug: candidate.slug,
          error: `post ${post.status}: ${post.body}`,
        });
      }
    } catch (err) {
      result.errors.push({
        slug: candidate.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
