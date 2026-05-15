/**
 * CS2 data layer — PandaScore API, normalized to EsportsMatch/EsportsTeam.
 *
 * All PandaScore schema details are contained here.
 * UI components import only from @/lib/esports/types.
 *
 * Graceful degradation: returns empty arrays/null when PANDASCORE_API_KEY is absent.
 *
 * ── FREE TIER RESTRICTIONS ───────────────────────────────────────────────────
 * Individual match endpoints (/csgo/matches/{id}) return 403 on the free plan.
 * All fetches use list endpoints only. fetchCS2Match searches the cached lists.
 *
 * ── CACHE ────────────────────────────────────────────────────────────────────
 * Caching is handled by Next.js fetch cache via next: { revalidate: N }.
 * TTLs: live=30s, upcoming=5min, past=30min, team history=2h.
 */

import type {
  EsportsMatch,
  EsportsTeam,
  EsportsPlayer,
  EsportsTournament,
  EsportsMatchStatus,
  CS2Map,
  CS2Stream,
} from "@/lib/esports/types";
import {
  resolveCanonicalTeamId,
  resolveCanonicalPlayerId,
  resolveCanonicalTournamentId,
  resolveCanonicalMatchId,
} from "@/lib/mappings/esports";

const PANDASCORE_BASE = "https://api.pandascore.co";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.PANDASCORE_API_KEY ?? ""}`,
    Accept: "application/json",
  };
}

// ─── Normalizers ──────────────────────────────────────────────────────────────

function normalizeStatus(raw: string): EsportsMatchStatus {
  switch (raw) {
    case "running":   return "live";
    case "finished":  return "completed";
    case "canceled":  return "cancelled";
    case "postponed": return "postponed";
    default:          return "not_started";
  }
}

function normalizePlayer(p: any): EsportsPlayer {
  return {
    id:          resolveCanonicalPlayerId({ name: p.name, slug: p.slug, id: p.id }, 'cs2'),
    externalId:  p.id,
    name:        [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || "",
    firstName:   p.first_name ?? undefined,
    lastName:    p.last_name  ?? undefined,
    handle:      p.name ?? "",
    nationality: p.nationality ?? undefined,
    role:        p.role ?? undefined,
    imageUrl:    p.image_url ?? undefined,
  };
}

function normalizeTeam(t: any): EsportsTeam | null {
  if (!t) return null;
  return {
    id:         resolveCanonicalTeamId({ name: t.name, slug: t.slug, id: t.id }, 'cs2'),
    externalId: t.id,
    name:       t.name    ?? "TBD",
    acronym:    t.acronym ?? t.name?.slice(0, 4).toUpperCase() ?? "TBD",
    imageUrl:   t.image_url ?? undefined,
    players:    Array.isArray(t.players)
      ? t.players.map(normalizePlayer)
      : undefined,
  };
}

function normalizeTournament(m: any): EsportsTournament {
  return {
    id:          resolveCanonicalTournamentId({ name: m.tournament?.name, slug: m.tournament?.slug, id: m.tournament?.id }),
    externalId:  m.tournament?.id ?? 0,
    name:        m.tournament?.name ?? m.league?.name ?? "Unknown Tournament",
    leagueId:    m.league?.id    ?? 0,
    seriesId:    m.serie?.id     ?? undefined,
    leagueName:  m.league?.name  ?? undefined,
    serieName:   m.serie?.full_name ?? undefined,
    beginAt:     m.tournament?.begin_at ?? undefined,
    endAt:       m.tournament?.end_at   ?? undefined,
  };
}

function normalizeMaps(games: any[], homeExtId: number, awayExtId: number): CS2Map[] {
  if (!Array.isArray(games)) return [];
  return games.map((g: any) => {
    const homeTeamData = g.teams?.find((t: any) => t.team?.id === homeExtId);
    const awayTeamData = g.teams?.find((t: any) => t.team?.id === awayExtId);
    return {
      name:      g.map?.name ?? "TBA",
      homeScore: homeTeamData?.score ?? 0,
      awayScore: awayTeamData?.score ?? 0,
      winnerId:  g.winner?.id
        ? resolveCanonicalTeamId({ name: g.winner.name, slug: g.winner.slug, id: g.winner.id }, 'cs2')
        : undefined,
      completed: g.status === "finished",
    };
  });
}

function normalizeStreams(list: any[]): CS2Stream[] {
  if (!Array.isArray(list)) return [];
  return list.map((s: any) => {
    const rawUrl   = s.raw_url   ?? s.url ?? "";
    const embedUrl = s.embed_url ?? rawUrl;
    return {
      language: s.language ?? "en",
      embedUrl,
      rawUrl,
      main:     Boolean(s.main),
      official: Boolean(s.official),
    };
  }).sort((a, b) => {
    // official + main first
    if (a.official !== b.official) return a.official ? -1 : 1;
    if (a.main !== b.main) return a.main ? -1 : 1;
    return 0;
  });
}

function normalizeMatch(m: any): EsportsMatch {
  const home       = normalizeTeam(m.opponents?.[0]?.opponent ?? null);
  const away       = normalizeTeam(m.opponents?.[1]?.opponent ?? null);
  const homeExtId  = m.opponents?.[0]?.opponent?.id as number | undefined;
  const awayExtId  = m.opponents?.[1]?.opponent?.id as number | undefined;

  const homeScore  = m.results?.find((r: any) => r.team_id === homeExtId)?.score ?? 0;
  const awayScore  = m.results?.find((r: any) => r.team_id === awayExtId)?.score ?? 0;

  return {
    id:            resolveCanonicalMatchId(m.id, 'cs2'),
    externalId:    m.id,
    status:        normalizeStatus(m.status),
    scheduledAt:   m.scheduled_at ?? null,
    beginAt:       m.begin_at     ?? null,
    endAt:         m.end_at       ?? null,
    tournament:    normalizeTournament(m),
    homeTeam:      home,
    awayTeam:      away,
    winnerId:      m.winner?.id
      ? resolveCanonicalTeamId({ name: m.winner.name, slug: m.winner.slug, id: m.winner.id }, 'cs2')
      : undefined,
    score:         { home: homeScore, away: awayScore },
    numberOfGames: m.number_of_games ?? 1,
    gameType:      "cs2",
    maps:          normalizeMaps(m.games ?? [], homeExtId ?? 0, awayExtId ?? 0),
    streams:       normalizeStreams(m.streams_list ?? []),
  };
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function pandaFetch<T>(
  apiPath: string,
  params: Record<string, string> = {},
  ttlMs = 60_000,
): Promise<T | null> {
  if (!process.env.PANDASCORE_API_KEY) return null;

  const url = new URL(`${PANDASCORE_BASE}${apiPath}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      next: { revalidate: Math.ceil(ttlMs / 1000) },
    });
    if (!res.ok) {
      console.warn(`[CS2] PandaScore ${res.status} — ${apiPath}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.error(`[CS2] fetch error — ${apiPath}`, err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchCS2Upcoming(limit = 20): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>(
    "/csgo/matches/upcoming",
    { per_page: String(limit), sort: "scheduled_at" },
    5 * 60_000,   // 5 min
  );
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2Live(): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>(
    "/csgo/matches/running",
    {},
    30_000,        // 30 s
  );
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2Past(limit = 20): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>(
    "/csgo/matches/past",
    { per_page: String(limit), sort: "-end_at" },
    30 * 60_000,  // 30 min — completed results don't change
  );
  return (raw ?? []).map(normalizeMatch);
}

/**
 * Finds a match by its canonical ID by searching through the cached lists.
 * Individual match endpoints (/csgo/matches/{id}) are blocked on the free tier.
 * The lists are already cached from the hub page — this adds 0 extra API calls.
 */
export async function fetchCS2Match(normalizedId: string): Promise<EsportsMatch | null> {
  const psId = normalizedId.replace(/^cs2\.match\./, "");

  const [live, upcoming, past] = await Promise.all([
    pandaFetch<any[]>("/csgo/matches/running", {}, 30_000),
    pandaFetch<any[]>("/csgo/matches/upcoming", { per_page: "50", sort: "scheduled_at" }, 5 * 60_000),
    pandaFetch<any[]>("/csgo/matches/past",     { per_page: "50", sort: "-end_at" },        30 * 60_000),
  ]);

  const all = [...(live ?? []), ...(upcoming ?? []), ...(past ?? [])];
  const raw = all.find((m: any) => String(m.id) === String(psId));
  return raw ? normalizeMatch(raw) : null;
}

export async function fetchCS2Team(slugOrId: string): Promise<EsportsTeam | null> {
  const raw = await pandaFetch<any>(
    `/teams/${slugOrId}`,
    {},
    4 * 3600_000,  // 4 h
  );
  if (!raw) return null;
  return normalizeTeam(raw);
}

export async function fetchCS2TeamMatchesByExternalId(
  externalId: number | string,
  limit = 20,
): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>(
    "/csgo/matches/past",
    { per_page: String(limit), sort: "-end_at", "filter[opponent_id]": String(externalId) },
    2 * 3600_000,  // 2 h — team history rarely changes mid-day
  );
  return (raw ?? []).map(normalizeMatch);
}

/** Fetch team past matches by slug (resolves slug → externalId first). */
export async function fetchCS2TeamMatches(
  slugOrId: string,
  limit = 20,
): Promise<EsportsMatch[]> {
  const teamRaw = await pandaFetch<any>(
    `/teams/${slugOrId}`,
    {},
    4 * 3600_000,
  );
  if (!teamRaw?.id) return [];
  return fetchCS2TeamMatchesByExternalId(teamRaw.id, limit);
}

export function hasAPIKey(): boolean {
  return Boolean(process.env.PANDASCORE_API_KEY);
}
