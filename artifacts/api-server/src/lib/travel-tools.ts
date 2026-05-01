/**
 * Travel-concierge tool layer for the chat pipeline.
 *
 * Defines the Gemini function-call schema for `searchViatorActivities`
 * and the server-side handler that turns a model's tool call into a
 * structured result the chat UI can render as activity cards.
 *
 * Kept narrow on purpose: it exposes ONE tool today (Viator search) but
 * is structured so a second tool (e.g. `getActivityDetails`) could be
 * added without touching the messages route. The route only needs to
 * know `getToolDeclarations` and `runTool` — everything else stays here.
 */
import { Type, type FunctionDeclaration } from "@workspace/integrations-gemini-ai";
import { searchActivities, buildAffiliateUrl, type ViatorActivity } from "./viator";
import { logger } from "./logger";

export const SEARCH_TOOL_NAME = "searchViatorActivities";

export interface ToolActivity {
  productCode: string;
  title: string;
  description: string;
  location: string;
  imageUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  durationMinutes: number | null;
  priceFrom: number | null;
  currency: string;
  /**
   * Pre-built `/api/affiliate/click/...` URL the UI hands to the
   * "Book on Viator" button. Server-relative so the deployed origin
   * doesn't need to be hardcoded.
   */
  bookUrl: string;
}

export interface ToolResultPayload {
  tool: typeof SEARCH_TOOL_NAME;
  mode: "live" | "demo";
  query: string;
  destination: string | null;
  activities: ToolActivity[];
}

export function getTravelToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: SEARCH_TOOL_NAME,
      description:
        "Search real Viator tours, activities, and attractions for a traveler. " +
        "Use this for any request to find things to do, day trips, food tours, " +
        "guided experiences, classes, or attractions in a city or region. " +
        "Always call this before recommending specific activities — never invent " +
        "Viator product codes or prices.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description:
              "What the traveler is looking for, e.g. 'half-day food tour', 'family-friendly things to do', 'sunset boat trip'.",
          },
          destination: {
            type: Type.STRING,
            description:
              "City, region, or country the traveler is asking about, e.g. 'Lisbon', 'Tokyo', 'Costa Rica'. Omit if the user did not specify.",
          },
          maxPrice: {
            type: Type.NUMBER,
            description:
              "Optional max per-person price in the destination's typical currency. Omit if no budget mentioned.",
          },
          limit: {
            type: Type.INTEGER,
            description: "How many activities to return (1-6). Default 4.",
          },
        },
        required: ["query"],
      },
    },
  ];
}

export interface RunSearchInput {
  args: Record<string, unknown>;
  agentSlug: string;
  userHandle: string | null;
  affiliateUrlBuilder: (
    productCode: string,
    destinationUrl: string,
    productTitle: string,
    price: number | null,
    currency: string,
  ) => string;
}

/**
 * Run a `searchViatorActivities` tool call. Always returns a payload (never
 * throws) so the model can recover gracefully — when the underlying API
 * fails we return zero activities and a `mode` that lets the UI explain
 * what happened.
 */
export async function runSearchTool(input: RunSearchInput): Promise<ToolResultPayload> {
  const query = typeof input.args.query === "string" ? input.args.query : "";
  const destination =
    typeof input.args.destination === "string" && input.args.destination.trim() !== ""
      ? input.args.destination.trim()
      : null;
  const maxPriceRaw = input.args.maxPrice;
  const maxPrice = typeof maxPriceRaw === "number" && Number.isFinite(maxPriceRaw)
    ? maxPriceRaw
    : null;
  const limitRaw = input.args.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(6, Math.round(limitRaw)))
      : 4;

  let activities: ViatorActivity[] = [];
  let mode: "live" | "demo" = "demo";

  try {
    const result = await searchActivities({ query, destination, limit, maxPrice });
    activities = result.activities;
    mode = result.mode;
  } catch (err) {
    logger.error({ err, agentSlug: input.agentSlug, query }, "travel-tools: search failed");
  }

  const wrapped: ToolActivity[] = activities.map((a) => ({
    productCode: a.productCode,
    title: a.title,
    description: a.description,
    location: a.location,
    imageUrl: a.imageUrl,
    rating: a.rating,
    reviewCount: a.reviewCount,
    durationMinutes: a.durationMinutes,
    priceFrom: a.priceFrom,
    currency: a.currency,
    bookUrl: input.affiliateUrlBuilder(
      a.productCode,
      buildAffiliateUrl(a.productUrl, null),
      a.title,
      a.priceFrom,
      a.currency,
    ),
  }));

  return {
    tool: SEARCH_TOOL_NAME,
    mode,
    query,
    destination,
    activities: wrapped,
  };
}
