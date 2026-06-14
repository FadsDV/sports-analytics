/**
 * AFL player data via Squiggle API — free, no key required.
 * Provides rosters and game-by-game stats for AFL players.
 */

import { ESPNPlayer, ESPNGameLogEntry, ESPNPlayerProfile } from "./espnPlayers";

const BASE = "https://api.squiggle.com.au";
const UA   = "SportsPulse/1.0 personal";

const AFL_TEAM_ALIASES: Record<string, string[]> = {
  "adelaide crows": ["adelaide"],
  "brisbane lions": ["brisbane"],
  carlton: ["carlton blues"],
  collingwood: ["collingwood magpies"],
  essendon: ["essendon bombers"],
  fremantle: ["fremantle dockers", "freo"],
  geelong: ["geelong cats"],
  "gold coast suns": ["gold coast"],
  "gws giants": ["greater western sydney", "gws"],
  hawthorn: ["hawthorn hawks"],
  melbourne: ["melbourne demons"],
  "north melbourne": ["kangaroos", "north melbourne kangaroos"],
  "port adelaide": ["port adelaide power"],
  richmond: ["richmond tigers"],
  "st kilda": ["st kilda saints"],
  "sydney swans": ["sydney"],
  "west coast eagles": ["west coast"],
  "western bulldogs": ["footscray", "bulldogs"],
};

function normalizeTeamName(name?: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function teamMatches(teamName: string, playerTeam?: string | null): boolean {
  const teamNorm = normalizeTeamName(teamName);
  const playerNorm = normalizeTeamName(playerTeam);
  if (!teamNorm || !playerNorm) return false;
  if (teamNorm === playerNorm) return true;
  const aliases = AFL_TEAM_ALIASES[teamNorm] ?? [];
  return aliases.some((alias) => playerNorm.includes(alias)) || playerNorm.includes(teamNorm);
}

// ─── Position normalisation ──────────────────────────────────────────────────

function normalizeAFLPosition(pos?: string | null): string {
  if (!pos) return "???";
  const p = pos.toLowerCase();
  if (p.includes("ruck"))              return "RUC";
  if (p.includes("centre"))           return "CTR";
  if (p.includes("half forward"))     return "HFF";
  if (p.includes("half back"))        return "HBF";
  if (p.includes("forward pocket"))   return "FWD";
  if (p.includes("back pocket"))      return "DEF";
  if (p.includes("full forward"))     return "FWD";
  if (p.includes("full back"))        return "DEF";
  if (p.includes("forward"))          return "FWD";
  if (p.includes("midfielder"))       return "MID";
  if (p.includes("defender") || p.includes("back")) return "DEF";
  return pos.slice(0, 3).toUpperCase();
}

// ─── Roster ──────────────────────────────────────────────────────────────────

/** Fetch all players for an AFL team (by Squiggle team name). */
export async function fetchAFLRoster(teamName: string): Promise<ESPNPlayer[] | null> {
  try {
    const year = new Date().getFullYear();
    const teamCandidates = [teamName, ...(AFL_TEAM_ALIASES[normalizeTeamName(teamName)] ?? [])];
    console.info("[SportsPulse] fetchAFLRoster", { teamName, teamCandidates, year });
    const requests = teamCandidates.map((candidate) =>
      fetch(`${BASE}/?q=players;year=${year};team=${encodeURIComponent(candidate)}`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": UA },
      }).then(async (res) => {
        console.info("[SportsPulse] fetchAFLRoster candidate status", {
          teamName,
          candidate,
          status: res.status,
        });
        return res.ok ? (await res.json()).players ?? [] : [];
      })
    );
    const teamPlayers = (await Promise.all(requests)).flat();

    // Fallback: fetch full player list and match by team string if team query returned empty.
    const players: any[] =
      teamPlayers.length > 0
        ? teamPlayers
        : await fetch(`${BASE}/?q=players;year=${year}`, {
            next: { revalidate: 3600 },
            headers: { "User-Agent": UA },
          })
            .then(async (res) => {
              console.info("[SportsPulse] fetchAFLRoster fallback status", {
                teamName,
                status: res.status,
              });
              return res.ok ? (await res.json()).players ?? [] : [];
            })
            .then((all: any[]) =>
              all.filter(
                (p) =>
                  teamMatches(teamName, p.team) ||
                  teamCandidates.some((candidate) => teamMatches(candidate, p.team))
              )
            );

    const unique = new Map<string, any>();
    for (const p of players) {
      const id = String(p.id ?? p.pid ?? "");
      if (!id || unique.has(id)) continue;
      unique.set(id, p);
    }

    const roster = Array.from(unique.values()).map((p: any): ESPNPlayer => ({
      id:           String(p.id ?? p.pid ?? ""),
      displayName:  p.name ?? p.displayName ?? "Unknown",
      jersey:       p.num != null ? String(p.num) : undefined,
      position:     normalizeAFLPosition(p.position),
      positionFull: p.position ?? undefined,
      headshot:     p.photo ?? undefined,
      seasonStats:  {},
    }));

    console.info("[SportsPulse] fetchAFLRoster response", {
      teamName,
      rosterCount: roster.length,
    });

    if (!roster.length) {
      console.warn("[SportsPulse] fetchAFLRoster empty", {
        teamName,
        todo: "AFL player data requires external source (scraper or paid API)",
      });
      return null;
    }

    return roster;
  } catch (error) {
    console.warn("[SportsPulse] fetchAFLRoster failed", {
      teamName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─── Player profile ───────────────────────────────────────────────────────────

/** Fetch a single AFL player's profile by Squiggle player ID. */
export async function fetchAFLPlayerProfile(
  playerId: string
): Promise<ESPNPlayerProfile | null> {
  try {
    const year = new Date().getFullYear();
    const url  = `${BASE}/?q=players;year=${year}`;
    const res  = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const players: any[] = data.players ?? [];

    const p = players.find((pl: any) => {
      const id = String(pl.id ?? pl.pid ?? "");
      const altId = String(pl.playerid ?? pl.player_id ?? "");
      return id === String(playerId) || altId === String(playerId);
    });
    if (!p) return null;

    return {
      id:           String(p.id ?? p.pid ?? playerId),
      name:         p.name ?? "Unknown",
      position:     normalizeAFLPosition(p.position),
      positionFull: p.position ?? undefined,
      jersey:       p.num != null ? String(p.num) : undefined,
      age:          p.dob
        ? Math.floor((Date.now() - new Date(p.dob).getTime()) / 31_557_600_000)
        : undefined,
      height:       p.ht ? `${p.ht} cm` : undefined,
      weight:       p.wt ? `${p.wt} kg` : undefined,
      nationality:  "Australian",
      headshot:     p.photo ?? undefined,
      teamName:     p.team ?? undefined,
      teamId:       p.teamid != null ? String(p.teamid) : undefined,
    };
  } catch {
    return null;
  }
}

// ─── Game log ─────────────────────────────────────────────────────────────────

/** Fetch per-game stats for an AFL player for the current season. */
export async function fetchAFLPlayerGameLog(
  playerId: string
): Promise<ESPNGameLogEntry[]> {
  try {
    const year = new Date().getFullYear();

    // Fetch stats + games in parallel
    const [statsRes, statsFallbackRes, gamesRes] = await Promise.all([
      fetch(`${BASE}/?q=stats;year=${year};pid=${playerId}`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": UA },
      }),
      fetch(`${BASE}/?q=player_stats;year=${year};pid=${playerId}`, {
        next: { revalidate: 3600 },
        headers: { "User-Agent": UA },
      }),
      fetch(`${BASE}/?q=games;year=${year}`, {
        next: { revalidate: 300 },
        headers: { "User-Agent": UA },
      }),
    ]);

    if (!statsRes.ok && !statsFallbackRes.ok) return [];
    const statsData = statsRes.ok ? await statsRes.json() : {};
    const fallbackData = statsFallbackRes.ok ? await statsFallbackRes.json() : {};
    const rawStats: any[] = [
      ...(statsData.stats ?? []),
      ...(fallbackData.player_stats ?? fallbackData.stats ?? []),
    ];

    // Build a quick game lookup
    const gameMap = new Map<number, any>();
    if (gamesRes.ok) {
      const gamesData = await gamesRes.json();
      for (const g of gamesData.games ?? []) {
        gameMap.set(g.id, g);
      }
    }

    const entries: ESPNGameLogEntry[] = rawStats
      .filter((s: any) => s.game != null)
      .map((s: any): ESPNGameLogEntry => {
        const gameId   = Number(s.game ?? s.gid ?? s.gameid);
        const game     = gameMap.get(gameId);
        const isHome   = game ? String(s.teamid) === String(game.hteamid) : null;
        const myScore  = game ? (isHome ? game.hscore : game.ascore) : null;
        const oppScore = game ? (isHome ? game.ascore : game.hscore) : null;
        let result: string | null = null;
        if (
          myScore != null &&
          oppScore != null &&
          !Number.isNaN(Number(myScore)) &&
          !Number.isNaN(Number(oppScore))
        ) {
          const letter = Number(myScore) > Number(oppScore)
            ? "W"
            : Number(myScore) < Number(oppScore)
            ? "L"
            : "D";
          result = `${letter} ${myScore}-${oppScore}`;
        }

        const dateRaw  =
          s.date ??
          (game?.date ? game.date.replace(" ", "T") : null) ??
          "";

        return {
          gameId:      Number.isNaN(gameId) ? null : String(gameId),
          date:        dateRaw ? String(dateRaw).slice(0, 10) : null,
          opponent:    s.opponent ?? (game ? (isHome ? game.ateam : game.hteam) : null) ?? null,
          opponentLogo: undefined,
          homeAway:    isHome == null ? null : isHome ? "home" : "away",
          result,
          stats: {
            G:   s.goals ?? null,
            B:   s.behinds ?? null,
            K:   s.kicks ?? null,
            HB:  s.handballs ?? null,
            D:   s.disposals ?? null,
            M:   s.marks ?? null,
            T:   s.tackles ?? null,
            HO:  s.hitouts ?? null,
            FF:  s.freesfor ?? null,
            FA:  s.freesagainst ?? null,
            CP:  s.contested_possessions ?? null,
            UP:  s.uncontested_possessions ?? null,
            CL:  s.clearances ?? null,
            I50: s.inside_50s ?? null,
            BV:  s.brownlow_votes ?? null,
          },
        };
      })
      .filter((e) => Boolean(e.date))
      .sort((a, b) => ((b.date ?? "") > (a.date ?? "") ? 1 : -1)); // most recent first

    return entries;
  } catch {
    return [];
  }
}

export async function fetchAFLPlayerSeasonStats(
  playerId: string
): Promise<Record<string, string | number | null> | null> {
  try {
    const year = new Date().getFullYear();
    const res = await fetch(`${BASE}/?q=stats;year=${year};pid=${playerId}`, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const season = data.player_stats ?? data.player ?? data.season ?? null;
    if (!season || typeof season !== "object" || Array.isArray(season)) return null;

    const stats: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(season)) {
      if (["id", "pid", "player", "name", "team", "teamid", "year"].includes(k)) continue;
      if (typeof v === "string" || typeof v === "number" || v == null) {
        stats[k] = v ?? null;
      }
    }
    return Object.keys(stats).length ? stats : null;
  } catch {
    return null;
  }
}
