/**
 * Squiggle AFL API — completely free, no key required.
 * https://api.squiggle.com.au
 */

import { FormResult, Game, H2HGame, Team } from "@/lib/types";

const BASE = "https://api.squiggle.com.au";
const UA   = "SportsPulse/1.0 (personal project - contact owner)";

export type AFLVenueFilter = "all" | "home" | "away";

// ─── Team logos ──────────────────────────────────────────────────────────────

const AFL_LOGOS: Record<string, string> = {
  "adelaide crows": "https://a.espncdn.com/i/teamlogos/afl/500/ade.png",
  adelaide: "https://a.espncdn.com/i/teamlogos/afl/500/ade.png",
  "brisbane lions": "https://a.espncdn.com/i/teamlogos/afl/500/bl.png",
  brisbane: "https://a.espncdn.com/i/teamlogos/afl/500/bl.png",
  carlton: "https://a.espncdn.com/i/teamlogos/afl/500/car.png",
  "carlton blues": "https://a.espncdn.com/i/teamlogos/afl/500/car.png",
  collingwood: "https://a.espncdn.com/i/teamlogos/afl/500/col.png",
  "collingwood magpies": "https://a.espncdn.com/i/teamlogos/afl/500/col.png",
  essendon: "https://a.espncdn.com/i/teamlogos/afl/500/ess.png",
  "essendon bombers": "https://a.espncdn.com/i/teamlogos/afl/500/ess.png",
  fremantle: "https://a.espncdn.com/i/teamlogos/afl/500/fre.png",
  "fremantle dockers": "https://a.espncdn.com/i/teamlogos/afl/500/fre.png",
  freo: "https://a.espncdn.com/i/teamlogos/afl/500/fre.png",
  geelong: "https://a.espncdn.com/i/teamlogos/afl/500/gee.png",
  "geelong cats": "https://a.espncdn.com/i/teamlogos/afl/500/gee.png",
  "gold coast suns": "https://a.espncdn.com/i/teamlogos/afl/500/gc.png",
  "gold coast": "https://a.espncdn.com/i/teamlogos/afl/500/gc.png",
  "gws giants": "https://a.espncdn.com/i/teamlogos/afl/500/gws.png",
  gws: "https://a.espncdn.com/i/teamlogos/afl/500/gws.png",
  "greater western sydney": "https://a.espncdn.com/i/teamlogos/afl/500/gws.png",
  hawthorn: "https://a.espncdn.com/i/teamlogos/afl/500/haw.png",
  "hawthorn hawks": "https://a.espncdn.com/i/teamlogos/afl/500/haw.png",
  melbourne: "https://a.espncdn.com/i/teamlogos/afl/500/mel.png",
  "melbourne demons": "https://a.espncdn.com/i/teamlogos/afl/500/mel.png",
  "north melbourne": "https://a.espncdn.com/i/teamlogos/afl/500/nm.png",
  kangaroos: "https://a.espncdn.com/i/teamlogos/afl/500/nm.png",
  "north melbourne kangaroos": "https://a.espncdn.com/i/teamlogos/afl/500/nm.png",
  "port adelaide": "https://a.espncdn.com/i/teamlogos/afl/500/pa.png",
  "port adelaide power": "https://a.espncdn.com/i/teamlogos/afl/500/pa.png",
  richmond: "https://a.espncdn.com/i/teamlogos/afl/500/ric.png",
  "richmond tigers": "https://a.espncdn.com/i/teamlogos/afl/500/ric.png",
  "st kilda": "https://a.espncdn.com/i/teamlogos/afl/500/stk.png",
  "st kilda saints": "https://a.espncdn.com/i/teamlogos/afl/500/stk.png",
  "sydney swans": "https://a.espncdn.com/i/teamlogos/afl/500/syd.png",
  sydney: "https://a.espncdn.com/i/teamlogos/afl/500/syd.png",
  "west coast eagles": "https://a.espncdn.com/i/teamlogos/afl/500/wce.png",
  "west coast": "https://a.espncdn.com/i/teamlogos/afl/500/wce.png",
  "western bulldogs": "https://a.espncdn.com/i/teamlogos/afl/500/wb.png",
  bulldogs: "https://a.espncdn.com/i/teamlogos/afl/500/wb.png",
  footscray: "https://a.espncdn.com/i/teamlogos/afl/500/wb.png",
};

function aflLogo(teamName: string): string | undefined {
  return AFL_LOGOS[normalizeTeamName(teamName)];
}

function normalizeTeamName(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Venue → City ─────────────────────────────────────────────────────────────

const VENUE_CITY: Record<string, string> = {
  "MCG":                  "Melbourne, VIC",
  "Marvel Stadium":        "Melbourne, VIC",
  "Docklands":             "Melbourne, VIC",
  "GMHBA Stadium":         "Geelong, VIC",
  "Kardinia Park":         "Geelong, VIC",
  "SCG":                   "Sydney, NSW",
  "Stadium Australia":     "Sydney, NSW",
  "Accor Stadium":         "Sydney, NSW",
  "Engie Stadium":         "Sydney, NSW",
  "Optus Stadium":         "Perth, WA",
  "Adelaide Oval":         "Adelaide, SA",
  "Gabba":                 "Brisbane, QLD",
  "The Gabba":             "Brisbane, QLD",
  "People First Stadium":  "Gold Coast, QLD",
  "Metricon Stadium":      "Gold Coast, QLD",
  "Norwood Oval":          "Adelaide, SA",
  "Blundstone Arena":      "Hobart, TAS",
  "Manuka Oval":           "Canberra, ACT",
  "TIO Stadium":           "Darwin, NT",
  "TIO Traeger Park":      "Alice Springs, NT",
};

function venueToCity(venue: string | null): string {
  if (!venue) return "Australia";
  for (const [k, v] of Object.entries(VENUE_CITY)) {
    if (venue.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "Australia";
}

// ─── Raw Squiggle types ───────────────────────────────────────────────────────

interface SquiggleGame {
  id:        number;
  year:      number;
  round:     number;
  roundname: string;
  hteam:     string;
  ateam:     string;
  hteamid:   number;
  ateamid:   number;
  hscore:    number | null;
  ascore:    number | null;
  winner:    string | null;
  date:      string | null; // "2026-05-10 14:10:00" AEDT
  venue:     string | null;
  complete:  number; // 0 = upcoming, 1-99 = live %, 100 = finished
  timestr:   string | null;
  tz:        string | null;
}

interface SquiggleStanding {
  name:       string;
  id:         number;
  wins:       number;
  losses:     number;
  draws:      number;
  played:     number;
  percentage: number;
  pts:        number;
  rank:       number;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchAFLGames(): Promise<SquiggleGame[]> {
  const year = new Date().getFullYear();
  try {
    const res = await fetch(`${BASE}/?q=games;year=${year}`, {
      next: { revalidate: 300 },
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.games ?? [];
  } catch {
    return [];
  }
}

export async function fetchAFLStandings(): Promise<SquiggleStanding[]> {
  const year = new Date().getFullYear();
  try {
    const res = await fetch(`${BASE}/?q=standings;year=${year}`, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.standings ?? [];
  } catch {
    return [];
  }
}

// ─── Transformers ─────────────────────────────────────────────────────────────

export function transformAFLGame(
  g: SquiggleGame,
  standings: SquiggleStanding[],
  allGames: SquiggleGame[],
  options?: { h2hLimit?: number; h2hFilter?: AFLVenueFilter }
): Omit<Game, "weather" | "betRisk"> {
  const status =
    g.complete === 100 ? "finished" :
    g.complete  >  0   ? "live"     : "upcoming";

  // Parse date — Squiggle gives time as AEDT (+10 or +11)
  const kickoff = g.date
    ? new Date(g.date.replace(" ", "T") + "+10:00").toISOString()
    : new Date().toISOString();

  const liveMinute =
    status === "live" ? Math.round((g.complete / 100) * 80) : undefined;

  // Build teams from standings
  const makeTeam = (name: string, id: number, isHome: boolean): Team => {
    const st = standings.find((s) => s.id === id);
    const form = deriveAFLForm(allGames, id);
    const splits = deriveAFLSplits(allGames, id);
    return {
      name,
      shortName: aflShortName(name),
      logo:      "🏉",
      logoUrl:   aflLogo(name),
      espnId:    String(id), // Squiggle team ID — used for roster lookups
      form,
      record:    st ? { wins: st.wins, losses: st.losses, draws: st.draws } : { wins: 0, losses: 0 },
      splits: {
        home: isHome ? splits.home : { wins: 0, losses: 0 },
        away: isHome ? { wins: 0, losses: 0 } : splits.away,
      },
      players: [],
    };
  };

  const h2h = deriveAFLH2H(
    allGames,
    g.hteamid,
    g.ateamid,
    g.id,
    options?.h2hLimit ?? 5,
    options?.h2hFilter ?? "all"
  );

  return {
    id:       `afl-${g.id}`,
    sport:    "afl",
    status,
    kickoff,
    venue:    g.venue ?? "TBA",
    city:     venueToCity(g.venue),
    homeTeam: makeTeam(g.hteam, g.hteamid, true),
    awayTeam: makeTeam(g.ateam, g.ateamid, false),
    score:
      status !== "upcoming" && g.hscore != null && g.ascore != null
        ? { home: g.hscore, away: g.ascore }
        : undefined,
    liveMinute,
    h2h,
    boxScore: undefined,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aflShortName(name: string): string {
  const MAP: Record<string, string> = {
    "Adelaide Crows":    "ADL",
    "Brisbane Lions":    "BRI",
    "Carlton":           "CAR",
    "Collingwood":       "COL",
    "Essendon":          "ESS",
    "Fremantle":         "FRE",
    "Geelong":           "GEE",
    "Gold Coast Suns":   "GCS",
    "GWS Giants":        "GWS",
    "Hawthorn":          "HAW",
    "Melbourne":         "MEL",
    "North Melbourne":   "NTH",
    "Port Adelaide":     "PTA",
    "Richmond":          "RIC",
    "St Kilda":          "STK",
    "Sydney Swans":      "SYD",
    "West Coast Eagles": "WCE",
    "Western Bulldogs":  "WBD",
  };
  return MAP[name] ?? name.slice(0, 3).toUpperCase();
}

/** Last 5 results for a team from Squiggle game list */
function deriveAFLForm(games: SquiggleGame[], teamId: number): FormResult[] {
  const finished = games
    .filter((g) => g.complete === 100 && (g.hteamid === teamId || g.ateamid === teamId))
    .slice(-5)
    .reverse(); // most recent first

  return finished.map((g) => {
    const isHome = g.hteamid === teamId;
    const myScore  = isHome ? g.hscore : g.ascore;
    const oppScore = isHome ? g.ascore : g.hscore;
    if (myScore == null || oppScore == null) return "L";
    return myScore > oppScore ? "W" : myScore < oppScore ? "L" : "D";
  });
}

/** Home and away split records for a team */
function deriveAFLSplits(games: SquiggleGame[], teamId: number) {
  const home = { wins: 0, losses: 0, draws: 0 };
  const away = { wins: 0, losses: 0, draws: 0 };

  games
    .filter((g) => g.complete === 100)
    .forEach((g) => {
      const isHome = g.hteamid === teamId;
      const isAway = g.ateamid === teamId;
      if (!isHome && !isAway) return;

      const myScore  = isHome ? g.hscore : g.ascore;
      const oppScore = isHome ? g.ascore : g.hscore;
      if (myScore == null || oppScore == null) return;
      const rec      = isHome ? home : away;

      if (myScore > oppScore)      rec.wins++;
      else if (myScore < oppScore) rec.losses++;
      else                         rec.draws++;
    });

  return { home, away };
}

/** Past meetings between two teams (up to 5) */
export function deriveAFLH2H(
  games: SquiggleGame[],
  homeId: number,
  awayId: number,
  excludeId: number,
  limit = 5,
  filter: AFLVenueFilter = "all"
): H2HGame[] {
  return games
    .filter(
      (g) =>
        g.complete === 100 &&
        g.id !== excludeId &&
        ((g.hteamid === homeId && g.ateamid === awayId) ||
          (g.hteamid === awayId && g.ateamid === homeId))
    )
    .filter((g) => {
      if (filter === "all") return true;
      const homePerspective = g.hteamid === homeId;
      return filter === "home" ? homePerspective : !homePerspective;
    })
    .slice(-limit)
    .reverse()
    .map((g) => {
      const hs = g.hscore;
      const as_ = g.ascore;
      let winner: string;
      if (hs == null || as_ == null) winner = "Unknown";
      else if (hs > as_)      winner = g.hteam;
      else if (as_ > hs) winner = g.ateam;
      else               winner = "Draw";
      return {
        gameId:   `afl-${g.id}`,
        date:     g.date?.slice(0, 10) ?? "",
        homeTeam: g.hteam,
        awayTeam: g.ateam,
        score:    hs != null && as_ != null ? `${hs}-${as_}` : "No data",
        venue:    g.venue ?? "Unknown",
        winner,
      };
    });
}

export interface AFLTeamHistoryGame {
  gameId: string;
  date: string;
  opponent: string;
  venue: string;
  homeAway: "home" | "away";
  score: string | null;
  result: "W" | "L" | "D" | null;
}

export function deriveAFLTeamHistory(
  games: SquiggleGame[],
  teamId: number,
  filter: AFLVenueFilter = "all"
): AFLTeamHistoryGame[] {
  return games
    .filter((g) => g.hteamid === teamId || g.ateamid === teamId)
    .map((g) => {
      const isHome = g.hteamid === teamId;
      if (filter === "home" && !isHome) return null;
      if (filter === "away" && isHome) return null;
      const myScore = isHome ? g.hscore : g.ascore;
      const oppScore = isHome ? g.ascore : g.hscore;
      let result: "W" | "L" | "D" | null = null;
      if (myScore != null && oppScore != null) {
        result = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "D";
      }
      return {
        gameId: `afl-${g.id}`,
        date: g.date?.slice(0, 10) ?? "",
        opponent: isHome ? g.ateam : g.hteam,
        venue: g.venue ?? "Unknown",
        homeAway: isHome ? "home" : "away",
        score:
          myScore != null && oppScore != null
            ? `${myScore}-${oppScore}`
            : null,
        result,
      } as AFLTeamHistoryGame;
    })
    .filter((g): g is AFLTeamHistoryGame => Boolean(g))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
