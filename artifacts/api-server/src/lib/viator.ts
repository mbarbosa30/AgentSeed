/**
 * Minimal Viator Partner API client used by the AgentSeed travel-concierge
 * tool-calling pipeline.
 *
 * Why this file is small on purpose
 * ---------------------------------
 * The Viator Partner API surface is enormous (products, locations, reviews,
 * pricing, supplier metadata, booking, etc.). For the bounty submission we
 * only need:
 *   - search a few activities matching a free-form query / destination
 *   - resolve a product code to a Viator product detail URL
 *   - build an affiliate deep link with the agent's `pid` attached
 *
 * If `VIATOR_API_KEY` is configured we hit the real Partner API at
 * https://api.viator.com/partner. Otherwise we serve a small, clearly
 * labeled set of canned activities so the demo agent ("Wanderbird") still
 * works end-to-end on a fresh Replit clone — but every result is tagged
 * `mode: "demo"` and a startup warning is logged. We never silently mix
 * fake data with real data.
 */
import { logger } from "./logger";

const PARTNER_BASE = process.env.VIATOR_API_BASE ?? "https://api.viator.com/partner";
const PRODUCT_PAGE_BASE =
  process.env.VIATOR_PRODUCT_PAGE_BASE ?? "https://www.viator.com/tours";
const SEARCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 64;

export type ViatorMode = "live" | "demo";

export interface ViatorActivity {
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
  productUrl: string;
}

export interface ViatorSearchResult {
  mode: ViatorMode;
  query: string;
  destination: string | null;
  activities: ViatorActivity[];
}

export function isViatorLive(): boolean {
  return Boolean(process.env.VIATOR_API_KEY);
}

let warnedDemoOnce = false;
function warnDemoModeOnce() {
  if (warnedDemoOnce) return;
  warnedDemoOnce = true;
  logger.warn(
    "Viator: VIATOR_API_KEY is not set — travel-concierge tool calls will return clearly-labeled demo activities. " +
      "Set VIATOR_API_KEY (Partner API key) to switch to live data.",
  );
}

// Tiny LRU-ish cache: short-lived dedupe for repeated searches inside a
// single chat session. Not safe across processes but fine for a single
// API server replica; bounded to keep memory predictable.
type CacheEntry = { value: ViatorSearchResult; expiresAt: number };
const searchCache = new Map<string, CacheEntry>();

function cacheKey(query: string, destination: string | null): string {
  return `${(destination ?? "").toLowerCase()}::${query.toLowerCase()}`;
}

function cacheGet(key: string): ViatorSearchResult | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    searchCache.delete(key);
    return null;
  }
  // Touch (LRU-ish): re-insert to move to the end.
  searchCache.delete(key);
  searchCache.set(key, entry);
  return entry.value;
}

function cacheSet(key: string, value: ViatorSearchResult) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
  searchCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export interface SearchOptions {
  query: string;
  destination?: string | null;
  /** Cap result size for chat rendering. */
  limit?: number;
  /** Optional max budget (per-person, in result currency). */
  maxPrice?: number | null;
}

export async function searchActivities(opts: SearchOptions): Promise<ViatorSearchResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 4, 8));
  const query = opts.query.trim();
  const destination = (opts.destination ?? null)?.trim() || null;

  const key = cacheKey(query, destination);
  const cached = cacheGet(key);
  if (cached) {
    // Re-apply maxPrice / limit on cached payload so the same cached search
    // can serve different downstream filtering without an API hit.
    return {
      ...cached,
      activities: filterActivities(cached.activities, opts.maxPrice ?? null).slice(0, limit),
    };
  }

  if (!isViatorLive()) {
    warnDemoModeOnce();
    const result = buildDemoResult(query, destination, limit, opts.maxPrice ?? null);
    cacheSet(key, result);
    return result;
  }

  try {
    const live = await searchViatorLive({ query, destination, limit });
    const filtered: ViatorSearchResult = {
      ...live,
      activities: filterActivities(live.activities, opts.maxPrice ?? null).slice(0, limit),
    };
    cacheSet(key, filtered);
    return filtered;
  } catch (err) {
    logger.error({ err, query, destination }, "Viator: live search failed");
    throw new Error(
      `Viator search failed for "${query}". The Partner API rejected the request or timed out — please try again.`,
    );
  }
}

function filterActivities(
  activities: ViatorActivity[],
  maxPrice: number | null,
): ViatorActivity[] {
  if (maxPrice == null || !Number.isFinite(maxPrice) || maxPrice <= 0) return activities;
  return activities.filter((a) => a.priceFrom == null || a.priceFrom <= maxPrice);
}

interface LiveSearchInput {
  query: string;
  destination: string | null;
  limit: number;
}

/**
 * Hit Viator's freetext / search endpoint. We try the v1
 * `/products/search` shape first (the legacy and most stable endpoint for
 * affiliates) and tolerate response shape drift.
 */
async function searchViatorLive(input: LiveSearchInput): Promise<ViatorSearchResult> {
  const apiKey = process.env.VIATOR_API_KEY;
  if (!apiKey) {
    throw new Error("VIATOR_API_KEY missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const url = `${PARTNER_BASE.replace(/\/+$/, "")}/products/search`;
    const body = {
      searchTerm: input.destination ? `${input.query} ${input.destination}` : input.query,
      currency: process.env.VIATOR_CURRENCY ?? "USD",
      topX: `1-${input.limit}`,
    };

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json;version=2.0",
        "Accept": "application/json;version=2.0",
        "Accept-Language": "en-US",
        "exp-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Viator API ${res.status} ${res.statusText}`);
    }

    const json: unknown = await res.json();
    return {
      mode: "live",
      query: input.query,
      destination: input.destination,
      activities: extractActivities(json, input.limit),
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractActivities(json: unknown, limit: number): ViatorActivity[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const list =
    (Array.isArray(root.products) && root.products) ||
    (Array.isArray(root.data) && root.data) ||
    (Array.isArray((root.data as Record<string, unknown> | undefined)?.products) &&
      (root.data as Record<string, unknown>).products) ||
    [];
  if (!Array.isArray(list)) return [];

  const out: ViatorActivity[] = [];
  for (const raw of list.slice(0, limit)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const productCode = pickString(r, ["productCode", "code"]);
    if (!productCode) continue;
    const title = pickString(r, ["title", "shortTitle", "name"]) ?? productCode;
    const description = pickString(r, ["shortDescription", "description"]) ?? "";
    const location = pickString(r, ["primaryDestinationName", "destinationName"]) ?? "";
    const imageUrl = pickImageUrl(r);
    const reviews = (r.reviews ?? {}) as Record<string, unknown>;
    const pricing = (r.pricing ?? r.price ?? {}) as Record<string, unknown>;
    const priceFrom = pickNumber(pricing, ["fromPrice", "priceFromUSD", "fromPriceBeforeDiscount"]);
    const currency = pickString(pricing, ["currency"]) ?? process.env.VIATOR_CURRENCY ?? "USD";
    const duration = pickNumber(r, ["durationInMinutes"]);

    out.push({
      productCode,
      title: title.slice(0, 140),
      description: description.slice(0, 280),
      location,
      imageUrl,
      rating: pickNumber(reviews, ["combinedAverageRating", "averageRating"]),
      reviewCount: pickNumber(reviews, ["totalReviews"]),
      durationMinutes: duration,
      priceFrom,
      currency,
      productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/${productCode}`,
    });
  }
  return out;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}
function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
function pickImageUrl(r: Record<string, unknown>): string | null {
  const direct = pickString(r, ["primaryPhotoUrl", "photoUrl", "thumbnailHiResURL", "thumbnailURL"]);
  if (direct) return direct;
  const images = r.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] as Record<string, unknown> | undefined;
    if (first) {
      const variants = first.variants;
      if (Array.isArray(variants) && variants.length > 0) {
        const v = variants[variants.length - 1] as Record<string, unknown> | undefined;
        if (v) return pickString(v, ["url"]);
      }
      return pickString(first, ["url", "imageUrl"]);
    }
  }
  return null;
}

/**
 * Build the outbound Viator product URL with affiliate attribution.
 * Falls back to the bare product page when no partner id is configured.
 */
export function buildAffiliateUrl(productUrl: string, partnerId: string | null): string {
  if (!partnerId) return productUrl;
  try {
    const u = new URL(productUrl);
    u.searchParams.set("pid", partnerId);
    if (process.env.VIATOR_MEDIA_CODE) {
      u.searchParams.set("mcid", process.env.VIATOR_MEDIA_CODE);
    }
    return u.toString();
  } catch {
    const sep = productUrl.includes("?") ? "&" : "?";
    return `${productUrl}${sep}pid=${encodeURIComponent(partnerId)}`;
  }
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_LIBRARY: ViatorActivity[] = [
  {
    productCode: "DEMO-LISBON-FOOD",
    title: "Lisbon: Tapas, Wine & Old Town Walking Food Tour",
    description:
      "A 3-hour small-group walk through Alfama with 6 local tastings, a glass of vinho verde, and history stops.",
    location: "Lisbon, Portugal",
    imageUrl: "https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=600&q=70",
    rating: 4.8,
    reviewCount: 1843,
    durationMinutes: 180,
    priceFrom: 65,
    currency: "EUR",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-LISBON-FOOD`,
  },
  {
    productCode: "DEMO-LISBON-SINTRA",
    title: "From Lisbon: Sintra, Pena Palace & Cabo da Roca Day Trip",
    description:
      "Full-day small-group trip to Sintra's Pena Palace, Cabo da Roca cliffs, and Cascais with hotel pickup.",
    location: "Lisbon, Portugal",
    imageUrl: "https://images.unsplash.com/photo-1558102822-da570eb113c5?auto=format&fit=crop&w=600&q=70",
    rating: 4.7,
    reviewCount: 5621,
    durationMinutes: 540,
    priceFrom: 89,
    currency: "EUR",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-LISBON-SINTRA`,
  },
  {
    productCode: "DEMO-ROME-FOOD",
    title: "Rome: Trastevere Half-Day Food Tour with a Local",
    description:
      "Trastevere food crawl: pizza al taglio, suppli, gelato, and Roman wine. Small group, under 4 hours.",
    location: "Rome, Italy",
    imageUrl: "https://images.unsplash.com/photo-1525874684015-58379d421a52?auto=format&fit=crop&w=600&q=70",
    rating: 4.9,
    reviewCount: 2210,
    durationMinutes: 210,
    priceFrom: 79,
    currency: "EUR",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-ROME-FOOD`,
  },
  {
    productCode: "DEMO-TOKYO-NIGHT",
    title: "Tokyo: Shinjuku Bar-Hopping Night Tour",
    description:
      "Three izakayas in Shinjuku's Omoide Yokocho with a local guide. Small group, drinks and snacks included.",
    location: "Tokyo, Japan",
    imageUrl: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=600&q=70",
    rating: 4.7,
    reviewCount: 942,
    durationMinutes: 180,
    priceFrom: 95,
    currency: "USD",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-TOKYO-NIGHT`,
  },
  {
    productCode: "DEMO-TOKYO-FUJI",
    title: "Tokyo: Mt. Fuji & Hakone Full-Day Tour",
    description:
      "Full-day group bus to Mt. Fuji 5th Station, Lake Ashi cruise, and Hakone ropeway. English-speaking guide.",
    location: "Tokyo, Japan",
    imageUrl: "https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?auto=format&fit=crop&w=600&q=70",
    rating: 4.5,
    reviewCount: 3120,
    durationMinutes: 660,
    priceFrom: 120,
    currency: "USD",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-TOKYO-FUJI`,
  },
  {
    productCode: "DEMO-BARCELONA-FAMILY",
    title: "Barcelona: Park Güell & Sagrada Familia Family Tour",
    description:
      "Half-day family-friendly walking tour with skip-the-line tickets to Sagrada Familia and Park Güell.",
    location: "Barcelona, Spain",
    imageUrl: "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=600&q=70",
    rating: 4.8,
    reviewCount: 4101,
    durationMinutes: 240,
    priceFrom: 75,
    currency: "EUR",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-BARCELONA-FAMILY`,
  },
  {
    productCode: "DEMO-NYC-BROADWAY",
    title: "New York: Behind-the-Scenes Broadway Walking Tour",
    description:
      "Two-hour Times Square + Theater District walking tour with a working Broadway actor as the guide.",
    location: "New York, United States",
    imageUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=600&q=70",
    rating: 4.9,
    reviewCount: 712,
    durationMinutes: 120,
    priceFrom: 45,
    currency: "USD",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-NYC-BROADWAY`,
  },
  {
    productCode: "DEMO-PARIS-COOK",
    title: "Paris: Hands-on French Pastry Class with a Pro Pastry Chef",
    description:
      "3-hour pastry class in a Marais kitchen — make chocolate éclairs and tarte au citron, take them home.",
    location: "Paris, France",
    imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=70",
    rating: 4.9,
    reviewCount: 1582,
    durationMinutes: 180,
    priceFrom: 110,
    currency: "EUR",
    productUrl: `${PRODUCT_PAGE_BASE.replace(/\/+$/, "")}/DEMO-PARIS-COOK`,
  },
];

function buildDemoResult(
  query: string,
  destination: string | null,
  limit: number,
  maxPrice: number | null,
): ViatorSearchResult {
  const haystackQuery = query.toLowerCase();
  const haystackDest = (destination ?? "").toLowerCase();
  const scored = DEMO_LIBRARY.map((a) => {
    const text =
      `${a.title} ${a.description} ${a.location}`.toLowerCase();
    let score = 0;
    if (haystackDest && text.includes(haystackDest)) score += 5;
    for (const token of haystackQuery.split(/\s+/).filter(Boolean)) {
      if (token.length < 3) continue;
      if (text.includes(token)) score += 1;
    }
    return { activity: a, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const ranked = scored.map((s) => s.activity);
  const filtered = filterActivities(ranked, maxPrice);
  // If nothing matched, fall back to a small generic slate so the model
  // still has something useful to talk about.
  const final = filtered.length > 0 ? filtered : ranked;
  return {
    mode: "demo",
    query,
    destination,
    activities: final.slice(0, limit),
  };
}
