// Thin PagerDuty client used by the SRE-Agent integration (Task #25).
// Wraps Events API v2 (trigger/resolve) + a single REST GET for incident
// triage notes. Fully no-op when env vars are missing so existing flows
// keep working.
import { logger } from "./logger";

const EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";
const REST_BASE = "https://api.pagerduty.com";

let warnedDisabled = false;

export type PagerDutySeverity = "critical" | "error" | "warning" | "info";

export type PagerDutyTriggerArgs = {
  dedupKey: string;
  summary: string;
  source: string;
  severity?: PagerDutySeverity;
  customDetails?: Record<string, unknown>;
  links?: Array<{ href: string; text: string }>;
};

export type PagerDutyEventResponse = {
  status: string;
  message?: string;
  dedup_key?: string;
};

export type PagerDutyIncidentSummary = {
  id: string;
  status: string;
  url: string | null;
  summary: string | null;
  service: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  triageNotes: string[];
};

function readRoutingKey(): string | null {
  const k = process.env.PAGERDUTY_ROUTING_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

function readApiToken(): string | null {
  const t = process.env.PAGERDUTY_API_TOKEN?.trim();
  return t && t.length > 0 ? t : null;
}

export function isPagerDutyConfigured(): boolean {
  return readRoutingKey() !== null;
}

export function isPagerDutyRestConfigured(): boolean {
  return readApiToken() !== null;
}

function logDisabledOnce(): void {
  if (warnedDisabled) return;
  warnedDisabled = true;
  logger.warn(
    "PagerDuty: PAGERDUTY_ROUTING_KEY unset — incidents will not be paged",
  );
}

async function postEvent(body: unknown): Promise<PagerDutyEventResponse | null> {
  try {
    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: PagerDutyEventResponse | null = null;
    try {
      parsed = JSON.parse(text) as PagerDutyEventResponse;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      logger.error(
        { status: res.status, body: text.slice(0, 200) },
        "PagerDuty: events API non-2xx",
      );
      return null;
    }
    return parsed;
  } catch (err) {
    logger.error({ err }, "PagerDuty: events API call failed");
    return null;
  }
}

export async function triggerIncident(
  args: PagerDutyTriggerArgs,
): Promise<PagerDutyEventResponse | null> {
  const routingKey = readRoutingKey();
  if (!routingKey) {
    logDisabledOnce();
    return null;
  }
  const payload = {
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key: args.dedupKey,
    payload: {
      summary: args.summary.slice(0, 1024),
      source: args.source,
      severity: args.severity ?? "error",
      component: "agentseed",
      custom_details: args.customDetails ?? {},
    },
    links: args.links ?? [],
  };
  return postEvent(payload);
}

export async function resolveIncident(
  dedupKey: string,
): Promise<PagerDutyEventResponse | null> {
  const routingKey = readRoutingKey();
  if (!routingKey) {
    logDisabledOnce();
    return null;
  }
  return postEvent({
    routing_key: routingKey,
    event_action: "resolve",
    dedup_key: dedupKey,
  });
}

type PdIncident = {
  id?: string;
  status?: string;
  html_url?: string;
  summary?: string;
  service?: { summary?: string };
  created_at?: string;
  resolved_at?: string | null;
};

type PdNote = { content?: string };

async function pdRestGet<T>(path: string): Promise<T | null> {
  const token = readApiToken();
  if (!token) return null;
  try {
    const res = await fetch(`${REST_BASE}${path}`, {
      method: "GET",
      headers: {
        accept: "application/vnd.pagerduty+json;version=2",
        authorization: `Token token=${token}`,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, path, body: text.slice(0, 200) },
        "PagerDuty: REST API non-2xx",
      );
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error({ err, path }, "PagerDuty: REST API call failed");
    return null;
  }
}

// Look up the active PagerDuty incident id for a given Events API dedup
// key. We only persist the dedup key locally (the events API response
// doesn't include the incident id) so this is required to read triage
// notes back. Searches both triggered + acknowledged so a recently
// resolved one isn't accidentally surfaced. Returns `null` when the
// REST token is missing or the lookup fails.
export async function findIncidentIdByDedupKey(
  dedupKey: string,
): Promise<string | null> {
  if (!dedupKey) return null;
  const params = new URLSearchParams();
  params.set("incident_key", dedupKey);
  // Include resolved so the admin page can still load triage notes for
  // a recently auto-resolved incident.
  for (const status of ["triggered", "acknowledged", "resolved"]) {
    params.append("statuses[]", status);
  }
  params.set("limit", "1");
  const data = await pdRestGet<{ incidents?: Array<{ id?: string }> }>(
    `/incidents?${params.toString()}`,
  );
  const id = data?.incidents?.[0]?.id;
  return id ?? null;
}

// Fetch an incident + its notes (the SRE Agent's triage shows up as
// notes on the incident). Returns `null` when the API token is missing
// or the call fails so the admin page can degrade gracefully.
export async function fetchIncidentSummary(
  incidentId: string,
): Promise<PagerDutyIncidentSummary | null> {
  if (!incidentId) return null;
  const data = await pdRestGet<{ incident?: PdIncident }>(
    `/incidents/${encodeURIComponent(incidentId)}`,
  );
  if (!data?.incident) return null;
  const incident = data.incident;

  const notesData = await pdRestGet<{ notes?: PdNote[] }>(
    `/incidents/${encodeURIComponent(incidentId)}/notes`,
  );
  const triageNotes =
    notesData?.notes
      ?.map((n) => (n.content ?? "").trim())
      .filter((s) => s.length > 0) ?? [];

  return {
    id: incident.id ?? incidentId,
    status: incident.status ?? "unknown",
    url: incident.html_url ?? null,
    summary: incident.summary ?? null,
    service: incident.service?.summary ?? null,
    createdAt: incident.created_at ?? null,
    resolvedAt: incident.resolved_at ?? null,
    triageNotes,
  };
}
