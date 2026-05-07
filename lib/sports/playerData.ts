import { Sport } from "@/lib/types";
import { ESPNGameLogEntry } from "@/lib/sports/espnPlayers";
import { ESPN_PATHS } from "@/lib/sports/espn";
import {
  fetchAFLPlayerGameLog,
  fetchAFLPlayerProfile,
  fetchAFLPlayerSeasonStats,
} from "@/lib/sports/aflPlayers";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface NormalizedGameLog {
  gameId: string | null;
  date: string | null;
  opponent: string | null;
  opponentLogo?: string;
  homeAway: "home" | "away" | null;
  result: string | null;
  stats: Record<string, string | number | null>;
}

export interface NormalizedPlayer {
  id: string;
  name: string;
  team: string | null;
  sport: Sport;
  seasonStats: Record<string, string | number | null> | null;
  gameLogs: NormalizedGameLog[];
  headshot?: string;
  position?: string;
  positionFull?: string;
  jersey?: string;
  age?: number;
  nationality?: string;
  height?: string;
  weight?: string;
  teamLogo?: string;
}

function extractEspnSummaryPlayerId(entry: any): string | null {
  const rawId =
    entry?.athlete?.id ??
    entry?.id ??
    entry?.playerId;
  if (rawId != null && String(rawId).trim()) {
    return String(rawId).trim();
  }

  const rawUid = entry?.athlete?.uid ?? entry?.uid;
  if (typeof rawUid === "string") {
    const athleteMatch = rawUid.match(/~a:(\d+)/);
    if (athleteMatch?.[1]) return athleteMatch[1];
    const trailingNumber = rawUid.match(/(\d+)(?!.*\d)/);
    if (trailingNumber?.[1]) return trailingNumber[1];
  }

  return null;
}

async function fetchRawEspnSummary(
  sport: keyof typeof ESPN_PATHS,
  eventId: string
): Promise<any | null> {
  const url = `${ESPN_BASE}/${ESPN_PATHS[sport]}/summary?event=${eventId}`;
  console.info("[SportsPulse] fetchRawEspnSummary", { sport, eventId, url });

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchRawEspnSummary status", {
      sport,
      eventId,
      status: res.status,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractEventId(gameId: string, sport: Sport): string | null {
  const prefix = `${sport}-`;
  if (!gameId.startsWith(prefix)) return null;
  const eventId = gameId.slice(prefix.length);
  return eventId || null;
}

async function fetchNormalizedEspnPlayerFromGame(
  sport: keyof typeof ESPN_PATHS,
  athleteId: string,
  sourceGameId: string
): Promise<NormalizedPlayer | null> {
  const eventId = extractEventId(sourceGameId, sport);
  if (!eventId) return null;

  const raw = await fetchRawEspnSummary(sport, eventId);
  if (!raw) return null;

  const competitors = raw?.header?.competitions?.[0]?.competitors ?? [];
  const homeTeam = competitors.find((c: any) => c.homeAway === "home");
  const awayTeam = competitors.find((c: any) => c.homeAway === "away");
  const eventDate = raw?.header?.competitions?.[0]?.date ?? raw?.header?.date ?? null;

  // ── Soccer: use rosters instead of boxscore.players ──────────────
  if (sport === "soccer" && Array.isArray(raw?.rosters)) {
    for (const rosterSection of raw.rosters) {
      const homeAway: "home" | "away" = rosterSection.homeAway === "home" ? "home" : "away";
      const opponentSection = raw.rosters.find((r: any) => r.homeAway !== rosterSection.homeAway);
      const opponentTeam = homeAway === "home" ? awayTeam?.team : homeTeam?.team;

      for (const p of rosterSection.roster ?? []) {
        const pid = String(p.athlete?.id ?? "");
        if (pid !== athleteId) continue;

        const stats: Record<string, string | number | null> = {};
        for (const s of p.stats ?? []) {
          const key = s.abbreviation ?? s.name;
          if (key) stats[key] = s.displayValue ?? s.value ?? null;
        }

        return {
          id: athleteId,
          name: p.athlete?.displayName ?? "Unknown",
          team: rosterSection.team?.displayName ?? null,
          sport,
          seasonStats: stats,
          gameLogs: [{
            gameId: eventId,
            date: eventDate ? String(eventDate).slice(0, 10) : null,
            opponent: opponentTeam?.displayName ?? null,
            opponentLogo: opponentTeam?.logo ?? opponentTeam?.logos?.[0]?.href,
            homeAway,
            result: null,
            stats,
          }],
          headshot: p.athlete?.headshot?.href ?? p.athlete?.headshot?.url,
          position: p.position?.abbreviation ?? p.athlete?.position?.abbreviation,
          positionFull: p.position?.displayName ?? p.athlete?.position?.displayName,
          jersey: p.jersey ?? p.athlete?.jersey,
          teamLogo: rosterSection.team?.logo ?? rosterSection.team?.logos?.[0]?.href,
        };
      }
    }
    return null;
  }

  // ── NBA / NFL: use boxscore.players ───────────────────────────────
  const playerSections = Array.isArray(raw?.boxscore?.players) ? raw.boxscore.players : [];
  console.info("[SportsPulse] fetchNormalizedEspnPlayerFromGame response", {
    sport, athleteId, sourceGameId, eventId,
    playerSections: playerSections.length,
  });

  if (!playerSections.length) return null;

  for (const section of playerSections) {
    const statGroups: any[] = section?.statistics ?? [];
    for (const group of statGroups) {
      const headers: string[] = group?.names ?? group?.labels ?? [];
      const athletes: any[] = group?.athletes ?? [];

      for (const athleteRow of athletes) {
        const summaryPlayerId = extractEspnSummaryPlayerId(athleteRow);
        if (summaryPlayerId !== athleteId) continue;

        const stats = Object.fromEntries(
          headers.map((header: string, index: number) => [header, athleteRow?.stats?.[index] ?? null])
        );

        const teamId = String(section?.team?.id ?? "");
        const isHome = teamId && homeTeam?.team?.id ? teamId === String(homeTeam.team.id) : null;
        const opponentTeam = isHome ? awayTeam?.team : homeTeam?.team;

        return {
          id: athleteId,
          name: athleteRow?.athlete?.displayName ?? "Unknown",
          team: section?.team?.displayName ?? section?.team?.shortDisplayName ?? null,
          sport,
          seasonStats: stats,
          gameLogs: [
            {
              gameId: eventId,
              date: eventDate ? String(eventDate).slice(0, 10) : null,
              opponent: opponentTeam?.displayName ?? null,
              opponentLogo: opponentTeam?.logo ?? opponentTeam?.logos?.[0]?.href,
              homeAway: isHome == null ? null : isHome ? "home" : "away",
              result: null,
              stats,
            },
          ],
          headshot:
            athleteRow?.athlete?.headshot?.href ??
            athleteRow?.athlete?.headshot?.url ??
            undefined,
          position:
            athleteRow?.athlete?.position?.abbreviation ??
            athleteRow?.position?.abbreviation,
          positionFull:
            athleteRow?.athlete?.position?.displayName ??
            athleteRow?.position?.displayName,
          jersey: athleteRow?.athlete?.jersey ?? athleteRow?.jersey,
          teamLogo:
            section?.team?.logo ??
            section?.team?.logos?.[0]?.href,
        };
      }
    }
  }

  return null;
}

export async function fetchNormalizedPlayerData(
  sport: Sport,
  athleteId: string,
  sourceGameId?: string
): Promise<NormalizedPlayer | null> {
  console.info("[SportsPulse] fetchNormalizedPlayerData", { sport, athleteId, sourceGameId: sourceGameId ?? null });
  let profile: Awaited<ReturnType<typeof fetchAFLPlayerProfile>> = null;
  let seasonStats: Record<string, string | number | null> | null = null;
  let gameLogs: ESPNGameLogEntry[] = [];

  if (sport === "afl") {
    [profile, seasonStats, gameLogs] = await Promise.all([
      fetchAFLPlayerProfile(athleteId),
      fetchAFLPlayerSeasonStats(athleteId),
      fetchAFLPlayerGameLog(athleteId),
    ]);
  } else if (sport in ESPN_PATHS) {
    if (!sourceGameId) return null;
    return fetchNormalizedEspnPlayerFromGame(
      sport as keyof typeof ESPN_PATHS,
      athleteId,
      sourceGameId
    );
  } else {
    return null;
  }

  console.info("[SportsPulse] fetchNormalizedPlayerData response", {
    sport,
    athleteId,
    hasProfile: Boolean(profile),
    seasonStatKeys: seasonStats ? Object.keys(seasonStats).length : 0,
    gameLogCount: gameLogs.length,
  });

  if (!profile) return null;

  return {
    id: profile.id,
    name: profile.name,
    team: profile.teamName ?? null,
    sport,
    seasonStats,
    gameLogs: gameLogs.map((g) => ({
      gameId: g.gameId ?? null,
      date: g.date ?? null,
      opponent: g.opponent ?? null,
      opponentLogo: g.opponentLogo,
      homeAway: g.homeAway ?? null,
      result: g.result ?? null,
      stats: g.stats,
    })),
    headshot: profile.headshot,
    position: profile.position,
    positionFull: profile.positionFull,
    jersey: profile.jersey,
    age: profile.age,
    nationality: profile.nationality,
    height: profile.height,
    weight: profile.weight,
    teamLogo: profile.teamLogo,
  };
}