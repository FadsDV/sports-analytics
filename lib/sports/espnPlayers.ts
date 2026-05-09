/**
 * ESPN player-level API functions: rosters, injuries, gamelogs, profiles.
 * No API key required — personal use only.
 */

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

function extractEspnEntityId(entity: any): string | null {
  const rawId =
    entity?.id ??
    entity?.athlete?.id ??
    entity?.playerId ??
    entity?.person?.id;
  if (rawId != null && String(rawId).trim()) {
    return String(rawId).trim();
  }

  const rawUid =
    entity?.uid ??
    entity?.athlete?.uid ??
    entity?.person?.uid;
  if (typeof rawUid === "string") {
    const athleteMatch = rawUid.match(/~a:(\d+)/);
    if (athleteMatch?.[1]) return athleteMatch[1];
    const trailingNumber = rawUid.match(/(\d+)(?!.*\d)/);
    if (trailingNumber?.[1]) return trailingNumber[1];
  }

  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ESPNPlayer {
  id:          string;
  displayName: string;
  jersey?:     string;
  position:    string; // abbreviation e.g. "MF", "GK", "PG"
  positionFull?: string;
  age?:        number;
  nationality?: string;
  height?:     string; // "189 cm"
  headshot?:   string; // URL
  seasonStats: Record<string, string | number>; // goals, assists, ppg, etc.
}

export interface ESPNInjury {
  playerId?:  string;
  playerName: string;
  position?:  string;
  status:     string; // "Out", "Doubtful", "Questionable", "Suspended"
  note:       string; // "Hamstring", "Groin — Out 2 weeks"
  headshot?:  string; // AFL CDN portrait URL (resolved server-side for AFL only)
}

export interface ESPNGameLogEntry {
  gameId:     string | null;
  date:       string | null; // "2026-04-18"
  opponent:   string | null;
  opponentLogo?: string;
  homeAway:   "home" | "away" | null;
  result:     string | null; // "W 2-1"
  stats:      Record<string, string | number | null>;
}

export interface ESPNPlayerProfile {
  id:          string;
  name:        string;
  position:    string;
  positionFull?: string;
  jersey?:     string;
  age?:        number;
  height?:     string;
  weight?:     string;
  nationality?: string;
  headshot?:   string;
  teamName?:   string;
  teamLogo?:   string;
  teamId?:     string;
}

export async function fetchPlayerSeasonStats(
  sportPath: string,
  athleteId: string
): Promise<Record<string, string | number | null> | null> {
  const url = `${BASE}/${sportPath}/athletes/${athleteId}/statistics`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchPlayerSeasonStats", {
      sportPath,
      athleteId,
      status: res.status,
      url,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const stats: Record<string, string | number | null> = {};
    const seasonTypes: any[] = data.splits?.categories ?? data.categories ?? [];

    for (const cat of seasonTypes) {
      const values: any[] = cat.stats ?? cat.splits?.[0]?.stats ?? [];
      for (const stat of values) {
        const key = stat.abbreviation ?? stat.name;
        if (!key) continue;
        const value =
          stat.displayValue ??
          stat.value ??
          stat.statValue ??
          null;
        stats[key] = value;
      }
    }

    return Object.keys(stats).length ? stats : null;
  } catch {
    return null;
  }
}

// ─── Roster ──────────────────────────────────────────────────────────────────

// AFL uses a dedicated roster provider — AFL Fantasy is the authoritative source.
// ESPN is used only for injuries, box scores, game logs, and player profile lookups.
import { fetchAFLTeamRoster } from "./afl/roster";

// Retained for fetchTeamInjuries below
import { getAFLFantasyMap, normalizeAFLName } from "./afl/fantasyMapper";
import { getAFLCDNPortraitUrl } from "./afl/champIDImages";

export async function fetchTeamRoster(
  sportPath: string,
  teamId:    string
): Promise<ESPNPlayer[]> {
  const isAFL = sportPath.includes("australian-football");

  // AFL: delegate entirely to the official AFL roster provider.
  // The provider uses AFL Fantasy (official AFL Digital product) as the sole
  // source of squad membership — ESPN is not involved in determining who
  // belongs to the team.
  if (isAFL) {
    return fetchAFLTeamRoster(teamId);
  }

  // Non-AFL: standard ESPN roster fetch
  const url = `${BASE}/${sportPath}/teams/${teamId}/roster`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] Roster fetch", { sportPath, teamId, url });
    if (!res.ok) return [];
    const data = await res.json();
    const results = parseRoster(data);
    console.info("[SportsPulse] Roster parsed", { sportPath, teamId, count: results.length });
    return results;
  } catch (err) {
    console.error("[SportsPulse] Roster fetch error", { sportPath, teamId, err });
    return [];
  }
}

function parseRoster(data: any): ESPNPlayer[] {
  const athletes: any[] = data.athletes ?? data.roster ?? [];
  const result: ESPNPlayer[] = [];

  for (const item of athletes) {
    // ESPN sometimes returns positional groups: { position: "GK", items: [...] }
    if (item.items && Array.isArray(item.items)) {
      const pos = item.position?.abbreviation ?? item.position ?? "??";
      for (const p of item.items) {
        const player = parsePlayer(p, pos);
        if (player) result.push(player);
      }
    } else {
      const player = parsePlayer(item, item.position?.abbreviation);
      if (player) result.push(player);
    }
  }

  return result;
}

function parsePlayer(p: any, fallbackPos?: string): ESPNPlayer | null {
  const playerId = extractEspnEntityId(p);
  if (!playerId) {
    console.warn("[SportsPulse] parsePlayer missing id", {
      displayName: p?.displayName ?? p?.fullName ?? null,
      fallbackPos,
    });
    return null;
  }

  const headshot =
    p.headshot?.href ??
    p.headshot?.url ??
    p.athlete?.headshot?.href ??
    p.athlete?.headshot?.url ??
    (playerId
      ? undefined // will use ESPN CDN pattern below
      : undefined);

  // ESPN CDN headshot pattern (works for most sports)
  const hsUrl =
    headshot ??
    (playerId
      ? `https://a.espncdn.com/i/headshots/soccer/players/full/${playerId}.png`
      : undefined);

  // Extract season stats if included
  const seasonStats: Record<string, string | number> = {};
  const statCategories = p.statistics?.splits?.categories ?? p.statistics?.categories ?? [];
  for (const cat of statCategories) {
    const stats = cat.stats ?? cat.splits?.[0]?.stats ?? [];
    for (const s of stats) {
      if (s.name && s.displayValue != null) {
        seasonStats[s.abbreviation ?? s.name] = s.displayValue;
      }
    }
  }

  return {
    id:           playerId,
    displayName:  p.displayName ?? p.fullName ?? p.athlete?.displayName ?? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
    jersey:       p.jersey ?? p.jerseyNumber ?? p.number ?? p.athlete?.jersey,
    position:     p.position?.abbreviation ?? p.athlete?.position?.abbreviation ?? fallbackPos ?? "??",
    positionFull: p.position?.displayName ?? p.position?.name ?? p.athlete?.position?.displayName,
    age:          p.age ?? p.athlete?.age,
    nationality:  p.citizenship ?? p.nationality ?? p.birthPlace?.country ?? p.athlete?.citizenship,
    height:       p.height ? `${p.height} cm` : p.athlete?.height ? `${p.athlete.height} cm` : undefined,
    headshot:     hsUrl,
    seasonStats,
  };
}

// ─── Team Injuries ───────────────────────────────────────────────────────────

export async function fetchTeamInjuries(
  sportPath: string,
  teamId:    string
): Promise<ESPNInjury[]> {
  const url = `${BASE}/${sportPath}/teams/${teamId}/injuries`;
  const isAFL = sportPath.includes("australian-football");
  try {
    const res = await fetch(url, {
      next: { revalidate: 900 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchTeamInjuries", { sportPath, teamId, status: res.status, url });
    if (!res.ok) return [];
    const data = await res.json();
    const injuries = parseInjuries(data);

    if (isAFL && injuries.length > 0) {
      const map = await getAFLFantasyMap();
      let matched = 0;
      for (const inj of injuries) {
        const champId = map.get(normalizeAFLName(inj.playerName));
        if (champId) {
          inj.headshot = getAFLCDNPortraitUrl(String(champId));
          matched++;
        } else {
          console.debug(`[SportsPulse] AFL injury portrait miss: "${inj.playerName}"`);
        }
      }
      console.info(`[SportsPulse] AFL injury portrait coverage: ${matched}/${injuries.length} — team ${teamId}`);
    }

    return injuries;
  } catch {
    return [];
  }
}

function parseInjuries(data: any): ESPNInjury[] {
  const items: any[] =
    data.injuries ??
    data.items ??
    data.data ??
    [];

  return items.map((inj: any) => {
    const athlete = inj.athlete ?? inj.player ?? inj;
    const rawStatus = inj.status ?? inj.type?.description ?? "Questionable";

    // Normalise status string
    let status = rawStatus;
    if (/suspend/i.test(rawStatus))           status = "Suspended";
    else if (/\bout\b/i.test(rawStatus))      status = "Out";
    else if (/doubtful/i.test(rawStatus))     status = "Doubtful";
    else if (/questionable/i.test(rawStatus)) status = "Questionable";
    else if (/probable/i.test(rawStatus))     status = "Probable";

    const note =
      inj.shortComment ??
      inj.longComment ??
      inj.comment ??
      inj.detail ??
      inj.type?.description ??
      "";

    return {
      playerId:   String(athlete?.id ?? ""),
      playerName: athlete?.displayName ?? athlete?.fullName ?? "Unknown",
      position:   athlete?.position?.abbreviation ?? "",
      status,
      note,
    };
  });
}

// ─── Player Profile ───────────────────────────────────────────────────────────

export async function fetchPlayerProfile(
  sportPath:  string,
  athleteId:  string
): Promise<ESPNPlayerProfile | null> {
  const url = `${BASE}/${sportPath}/athletes/${athleteId}`;
  try {
    console.info("[SportsPulse] fetchPlayerProfile", { sportPath, athleteId, url });
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchPlayerProfile status", {
      sportPath,
      athleteId,
      status: res.status,
    });
    if (!res.ok) {
      console.warn("[SportsPulse] fetchPlayerProfile non-ok response", {
        sportPath,
        athleteId,
        status: res.status,
      });
      return null;
    }
    const data = await res.json();
    const a = data.athlete ?? data;
    console.info("[SportsPulse] fetchPlayerProfile response", {
      sportPath,
      athleteId,
      resolvedId: a?.id ?? null,
      name: a?.displayName ?? a?.fullName ?? null,
    });

    return {
      id:           String(a.id ?? athleteId),
      name:         a.displayName ?? a.fullName ?? "Unknown",
      position:     a.position?.abbreviation ?? "??",
      positionFull: a.position?.displayName ?? a.position?.name,
      jersey:       a.jersey ?? a.jerseyNumber,
      age:          a.age,
      height:       a.height ? `${a.height} cm` : undefined,
      weight:       a.weight ? `${a.weight} kg` : undefined,
      nationality:  a.citizenship ?? a.birthPlace?.country ?? a.nationality,
      headshot:     a.headshot?.href,
      teamName:     a.team?.displayName ?? a.team?.shortDisplayName,
      teamLogo:     a.team?.logos?.[0]?.href ?? a.team?.logo,
      teamId:       a.team?.id,
    };
  } catch {
    return null;
  }
}

// ─── Player Gamelog ───────────────────────────────────────────────────────────

export async function fetchPlayerGameLog(
  sportPath: string,
  athleteId: string
): Promise<ESPNGameLogEntry[]> {
  const url = `${BASE}/${sportPath}/athletes/${athleteId}/gamelog`;
  try {
    console.info("[SportsPulse] fetchPlayerGameLog", { sportPath, athleteId, url });
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    console.info("[SportsPulse] fetchPlayerGameLog status", {
      sportPath,
      athleteId,
      status: res.status,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return parseGameLog(data, sportPath);
  } catch {
    return [];
  }
}

function parseGameLog(data: any, sportPath: string): ESPNGameLogEntry[] {
  const entries: ESPNGameLogEntry[] = [];
  const disallowDraw = /basketball\/nba|football\/nfl/.test(sportPath);

  // ESPN returns different shapes per sport — handle all
  const seasonTypes: any[] = data.seasonTypes ?? data.seasons ?? [data];

  for (const st of seasonTypes) {
    const categories: any[] = st.categories ?? [st];
    for (const cat of categories) {
      const names: string[] = cat.names ?? cat.labels ?? cat.columns ?? [];
      const events: any[]  = cat.events ?? cat.games ?? cat.logs ?? [];

      for (const ev of events) {
        if (!ev) continue;

        // Stats can be an array matching `names`, or a keyed object
        const statsArr: (string | number | null)[] = ev.stats ?? ev.values ?? [];
        const statsObj: Record<string, string | number | null> = {};
        if (Array.isArray(statsArr)) {
          names.forEach((n, i) => { statsObj[n] = statsArr[i] ?? null; });
        } else if (typeof statsArr === "object") {
          for (const [k, v] of Object.entries(statsArr)) {
            statsObj[k] = (v as string | number | null) ?? null;
          }
        }

        // Scores
        const myScoreRaw = ev.teamScore ?? ev.score;
        const oppScoreRaw = ev.opponentTeamScore ?? ev.oppScore;
        const myScore =
          myScoreRaw != null && !Number.isNaN(Number(myScoreRaw))
            ? Number(myScoreRaw)
            : null;
        const oppScore =
          oppScoreRaw != null && !Number.isNaN(Number(oppScoreRaw))
            ? Number(oppScoreRaw)
            : null;
        let result: string | null =
          ev.result ?? ev.displayResult ?? ev.outcome ?? null;
        if (!result && myScore != null && oppScore != null) {
          const letter = myScore > oppScore ? "W" : myScore < oppScore ? "L" : disallowDraw ? "L" : "D";
          result = `${letter} ${myScore}-${oppScore}`;
        }

        const dateRaw =
          ev.eventDate?.date ?? ev.eventDate ?? ev.date ?? ev.gameDate ?? "";
        const gameIdRaw = ev.id ?? ev.eventId ?? ev.gameId ?? ev.game?.id;

        entries.push({
          gameId:      gameIdRaw != null ? String(gameIdRaw) : null,
          date:        dateRaw ? String(dateRaw).slice(0, 10) : null,
          opponent:    ev.opponent?.displayName ?? ev.opponentName ?? ev.opponentTeam?.displayName ?? null,
          opponentLogo: ev.opponent?.logos?.[0]?.href ?? ev.opponent?.logo,
          homeAway:    ev.homeAway === "home" || ev.homeAway === "away" ? ev.homeAway : null,
          result,
          stats:       statsObj,
        });
      }
    }
  }

  return entries
    .filter((e) => Boolean(e.date))
    .sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : -1));
}
