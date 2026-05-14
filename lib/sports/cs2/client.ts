/**
 * CS2 data layer — PandaScore API, normalized to EsportsMatch/EsportsTeam.
 *
 * All PandaScore schema details are contained here.
 * UI components import only from @/lib/esports/types.
 *
 * Graceful degradation: returns empty arrays/null when PANDASCORE_API_KEY is absent.
 */

import type {
  EsportsMatch,
  EsportsTeam,
  EsportsPlayer,
  EsportsTournament,
  EsportsMatchStatus,
  CS2Map,
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
  };
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function pandaFetch<T>(
  path: string,
  params: Record<string, string> = {},
  revalidate = 60,
): Promise<T | null> {
  if (!process.env.PANDASCORE_API_KEY) return null;

  const url = new URL(`${PANDASCORE_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetch(url.toString(), {
      headers: authHeaders(),
      next: { revalidate },
    });
    if (!res.ok) {
      console.warn(`[CS2] PandaScore ${res.status} — ${path}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.error(`[CS2] fetch error — ${path}`, err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchCS2Upcoming(limit = 20): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>("/csgo/matches/upcoming", {
    per_page: String(limit),
    sort: "scheduled_at",
  });
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2Live(): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>("/csgo/matches/running", {}, 15);
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2Past(limit = 20): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>("/csgo/matches/past", {
    per_page: String(limit),
    sort: "-end_at",
  });
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2Match(normalizedId: string): Promise<EsportsMatch | null> {
  const psId = normalizedId.replace(/^cs2\.match\./, "");
  const raw  = await pandaFetch<any>(`/csgo/matches/${psId}`, {}, 30);
  if (!raw) return null;
  return normalizeMatch(raw);
}

export async function fetchCS2Team(slugOrId: string): Promise<EsportsTeam | null> {
  const raw = await pandaFetch<any>(`/teams/${slugOrId}`, {}, 3600);
  if (!raw) return null;
  return normalizeTeam(raw);
}

export async function fetchCS2TeamMatches(
  slugOrId: string,
  limit = 6,
): Promise<EsportsMatch[]> {
  const teamRaw = await pandaFetch<any>(`/teams/${slugOrId}`, {}, 3600);
  if (!teamRaw?.id) return [];

  const raw = await pandaFetch<any[]>("/csgo/matches/past", {
    per_page: String(limit),
    sort: "-end_at",
    "filter[opponent_id]": String(teamRaw.id),
  });
  return (raw ?? []).map(normalizeMatch);
}

export async function fetchCS2TeamMatchesByExternalId(
  externalId: number | string,
  limit = 20,
): Promise<EsportsMatch[]> {
  const raw = await pandaFetch<any[]>("/csgo/matches/past", {
    per_page: String(limit),
    sort: "-end_at",
    "filter[opponent_id]": String(externalId),
  });
  return (raw ?? []).map(normalizeMatch);
}

export function hasAPIKey(): boolean {
  return Boolean(process.env.PANDASCORE_API_KEY);
}
