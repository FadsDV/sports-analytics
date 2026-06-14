#!/usr/bin/env node
/**
 * DegenHUB — Local Sofascore Data Collector
 *
 * Runs on your machine (residential IP — bypasses Vercel's Sofascore block).
 * Fetches lineups, team stats, player stats for upcoming soccer games and
 * commits the JSON files to Git so Vercel can read them as static data.
 *
 * Usage:
 *   node scripts/collect-soccer.mjs              # collect next 48h of games
 *   node scripts/collect-soccer.mjs --live       # also refresh live game data
 *   node scripts/collect-soccer.mjs --game <id>  # collect a specific ESPN game ID
 *   node scripts/collect-soccer.mjs --dry-run    # write JSON files but skip git commit/push
 *
 * Schedule (cron or day-trading agent):
 *   0  8 * * *  node /path/to/collect-soccer.mjs   # morning run — team stats
 *   30 * * * *  node /path/to/collect-soccer.mjs   # every 30min — catch lineup drops
 *
 * NO FAKE DATA — if Sofascore can't be reached, files are not written.
 */

import { execFile }    from "child_process";
import { promisify }   from "util";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = join(__dirname, "..");
const DATA_DIR    = join(REPO_ROOT, "data", "soccer");
const EVENTS_DIR  = join(DATA_DIR, "events");
const PLAYERS_DIR = join(DATA_DIR, "players");

const execFileAsync = promisify(execFile);

// ─── Load .env.local ──────────────────────────────────────────────────────────
const envPath = join(REPO_ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ─── Sofascore fetch via curl_cffi Python helper (Chrome TLS impersonation) ───
// curl_cffi impersonates Chrome's exact TLS fingerprint, bypassing bot detection.
// Install: pip install curl-cffi

const SOFA_BASE   = "https://api.sofascore.com/api/v1";
const SOFA_SCRIPT = join(__dirname, "sofa-fetch.py");

async function sofaFetch(path) {
  const url = path.startsWith("http") ? path : `${SOFA_BASE}${path}`;
  try {
    const { stdout } = await execFileAsync("python3", [SOFA_SCRIPT, url], {
      maxBuffer: 20 * 1024 * 1024,
    });
    const data = JSON.parse(stdout);
    if (data?.__error) { console.warn(`[sofa] error ${url}:`, data.__error); return null; }
    if (data?.__status) { console.warn(`[sofa] HTTP ${data.__status} ${url}`); return null; }
    if (data?.error)    { console.warn(`[sofa] API error ${url}:`, data.error); return null; }
    return data;
  } catch (err) {
    console.warn(`[sofa] fetch failed ${url}:`, err.message);
    return null;
  }
}

async function closeBrowser() {} // no-op — no browser to clean up

// ─── ESPN scoreboard — get upcoming soccer games ──────────────────────────────

const ESPN_SPORTS = [
  { sport: "soccer",    league: "eng.1",         name: "Premier League",    key: "soccer"    },
  { sport: "soccer",    league: "esp.1",          name: "La Liga",           key: "laliga"    },
  { sport: "soccer",    league: "ger.1",          name: "Bundesliga",        key: "bundesliga"},
  { sport: "soccer",    league: "ita.1",          name: "Serie A",           key: "soccer"    },
  { sport: "soccer",    league: "fra.1",          name: "Ligue 1",           key: "soccer"    },
  { sport: "soccer",    league: "uefa.champions", name: "Champions League",  key: "ucl"       },
  { sport: "soccer",    league: "uefa.europa",    name: "Europa League",     key: "uel"       },
  { sport: "soccer",    league: "usa.1",          name: "MLS",               key: "soccer"    },
  { sport: "soccer",    league: "aus.1",          name: "A-League",          key: "aleague"   },
  { sport: "soccer",    league: "fifa.world",     name: "World Cup",         key: "worldcup"  },
];

async function fetchUpcomingGames(daysAhead = 2) {
  const games = [];
  const now  = new Date();
  const dates = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }

  for (const { sport, league, name: leagueName, key: sportKey } of ESPN_SPORTS) {
    const dateStr = dates.join("-");
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dates[0]}-${dates[dates.length - 1]}&limit=50`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const events = data.events ?? [];
      for (const ev of events) {
        const status = ev.status?.type?.name ?? "";
        // Include scheduled (pre-match) and optionally in-progress (live)
        if (!["STATUS_SCHEDULED", "STATUS_IN_PROGRESS", "STATUS_HALFTIME"].includes(status)) continue;
        const comps = ev.competitions?.[0];
        if (!comps) continue;
        const home = comps.competitors?.find(c => c.homeAway === "home");
        const away = comps.competitors?.find(c => c.homeAway === "away");
        if (!home || !away) continue;
        games.push({
          espnGameId:    `${sportKey}-${ev.id}`,
          espnId:        ev.id,
          league:        leagueName,
          kickoffISO:    ev.date,
          homeTeamName:  home.team.displayName ?? home.team.name,
          awayTeamName:  away.team.displayName ?? away.team.name,
          homeEspnId:    home.team.id,
          awayEspnId:    away.team.id,
          status,
        });
      }
    } catch (err) {
      console.warn(`[espn] fetch failed ${league}:`, err.message);
    }
  }
  return games;
}

// ─── Name normalisation (mirrors sofascore.ts) ────────────────────────────────

const CITY_ALIASES = [
  [/\bcologne\b/g,      "koln"],
  [/\bmunich\b/g,       "munchen"],
  [/\bmuenchen\b/g,     "munchen"],
  [/\bathens\b/g,       "athen"],
  [/\brome\b/g,         "roma"],
  [/\bmilan\b/g,        "milano"],
  // National team name variants (ESPN vs Sofascore)
  [/\bivory coast\b/g,  "cote divoire"],
  [/\bcote d.ivoire\b/g,"cote divoire"],
  [/\bcape verde\b/g,   "cabo verde"],
];

function normName(name) {
  let s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const [pattern, replacement] of CITY_ALIASES) s = s.replace(pattern, replacement);
  return s
    .replace(/\bfc\b|\bcf\b|\bafc\b|\bsc\b|\bac\b|\bas\b|\bss\b|\brc\b|\bcd\b|\bud\b|\bsd\b|\bsv\b|\bfsv\b|\bssv\b|\bvfl\b|\bvfb\b|\brb\b|\btsg\b|\bbsc\b|\btsv\b|\bfk\b|\bsk\b|\bif\b|\bbk\b|\bgif\b/g, "")
    .replace(/\b(real|atletico|sporting|united|city|borussia|dynamo|lokomotiv|spartak)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function namesMatch(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const short = na.length < nb.length ? na : nb;
  const long  = na.length < nb.length ? nb : na;
  if (short.length >= 5 && long.startsWith(short)) return true;
  return false;
}

// ─── Find Sofascore event ID ──────────────────────────────────────────────────

async function findSofascoreEventId(homeTeamName, awayTeamName, kickoffISO) {
  const base = new Date(kickoffISO);
  const dates = [0, -1, 1].map(off => {
    const d = new Date(base);
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  });

  for (const dateStr of dates) {
    const data = await sofaFetch(`/sport/football/scheduled-events/${dateStr}`);
    if (!data) continue;
    for (const ev of (data.events ?? [])) {
      const home = ev.homeTeam?.name ?? "";
      const away = ev.awayTeam?.name ?? "";
      if (namesMatch(home, homeTeamName) && namesMatch(away, awayTeamName)) {
        return {
          sofascoreId:  ev.id,
          homeTeamId:   ev.homeTeam?.id ?? null,
          awayTeamId:   ev.awayTeam?.id ?? null,
          tournamentId: ev.tournament?.uniqueTournament?.id ?? null,
          seasonId:     ev.season?.id ?? null,
        };
      }
    }
  }
  return null;
}

// ─── Fetch lineups ────────────────────────────────────────────────────────────

async function fetchLineups(sofascoreId) {
  const data = await sofaFetch(`/event/${sofascoreId}/lineups`);
  if (!data) return null;

  const parseTeam = side => {
    if (!side?.players) return [];
    return side.players.map(p => {
      const player = p.player ?? {};
      const stats  = p.statistics ?? {};
      const statsOut = {};
      for (const [k, v] of Object.entries(stats)) {
        statsOut[k] = typeof v === "number" ? v : null;
      }
      const minsPlayed = stats.minutesPlayed != null
        ? stats.minutesPlayed
        : stats.secondsPlayed != null
        ? Math.round(stats.secondsPlayed / 60)
        : undefined;
      return {
        id:           player.id ?? 0,
        name:         player.name ?? "Unknown",
        shortName:    player.shortName ?? player.name ?? "Unknown",
        position:     p.position ?? player.position ?? "?",
        jerseyNumber: String(p.jerseyNumber ?? p.shirtNumber ?? ""),
        starter:      !p.substitute,
        minutesPlayed: minsPlayed,
        rating:       stats.rating ?? undefined,
        stats:        statsOut,
      };
    });
  };

  return {
    confirmed:     Boolean(data.confirmed),
    homeFormation: data.home?.formation,
    awayFormation: data.away?.formation,
    home:          parseTeam(data.home),
    away:          parseTeam(data.away),
  };
}

// ─── Fetch team season stats ──────────────────────────────────────────────────

async function fetchTeamSeasonStats(teamId, tournamentId, seasonId) {
  const data = await sofaFetch(`/team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`);
  if (!data) return null;
  const s = data.statistics ?? {};
  const n = k => typeof s[k] === "number" ? s[k] : null;
  return {
    matches:                  n("matches") ?? 0,
    goalsScored:              n("goalsScored") ?? 0,
    goalsConceded:            n("goalsConceded") ?? 0,
    shots:                    n("shots"),
    shotsOnTarget:            n("shotsOnTarget"),
    corners:                  n("corners"),
    fouls:                    n("fouls"),
    yellowCards:              n("yellowCards"),
    redCards:                 n("redCards"),
    saves:                    n("saves"),
    averageBallPossession:    n("averageBallPossession"),
    accuratePassesPercentage: n("accuratePassesPercentage"),
  };
}

// ─── Fetch top scorers ────────────────────────────────────────────────────────

async function fetchTopScorers(tournamentId, seasonId) {
  const data = await sofaFetch(`/unique-tournament/${tournamentId}/season/${seasonId}/statistics?group=overall&filter=overall&limit=10&offset=0&accumulation=total&fields=goals%2Cassists%2CshotsOnTarget%2Crating`);
  if (!data) return [];
  return (data.results ?? [])
    .filter(r => (r.goals ?? 0) > 0)
    .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))
    .slice(0, 8)
    .map(r => ({
      playerId:      r.player?.id ?? 0,
      playerName:    r.player?.name ?? "",
      shortName:     r.player?.shortName ?? r.player?.name ?? "",
      teamName:      r.team?.shortName ?? r.team?.name ?? "",
      goals:         r.goals ?? 0,
      assists:       r.assists ?? 0,
      shotsOnTarget: typeof r.shotsOnTarget === "number" ? r.shotsOnTarget : null,
      rating:        typeof r.rating === "number" ? r.rating : null,
    }));
}

// ─── Fetch player data ────────────────────────────────────────────────────────

async function fetchPlayerData(playerId, tournamentIdHint) {
  // Season stats
  const seasonsData = await sofaFetch(`/player/${playerId}/statistics/seasons`);
  let tournamentId = null, seasonId = null, seasonStats = null;

  if (seasonsData) {
    const tsList = seasonsData.uniqueTournamentSeasons ?? [];
    const ordered = tournamentIdHint
      ? [...tsList.filter(ts => ts.uniqueTournament?.id === tournamentIdHint), ...tsList.filter(ts => ts.uniqueTournament?.id !== tournamentIdHint)]
      : tsList;
    for (const ts of ordered) {
      if ((ts.seasons ?? []).length > 0) {
        tournamentId = ts.uniqueTournament?.id;
        seasonId     = ts.seasons[0].id;
        break;
      }
    }
    if (tournamentId && seasonId) {
      const statsData = await sofaFetch(`/player/${playerId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`);
      if (statsData) {
        const s = statsData.statistics ?? {};
        const n = k => typeof s[k] === "number" ? s[k] : null;
        seasonStats = {
          appearances:              n("appearances"),
          minutesPlayed:            n("minutesPlayed"),
          goals:                    n("goals"),
          assists:                  n("assists"),
          rating:                   n("rating"),
          shotsOnTarget:            n("shotsOnTarget"),
          totalShots:               n("totalShots"),
          accuratePassesPercentage: n("accuratePassesPercentage"),
          keyPasses:                n("keyPasses"),
          tackles:                  n("tackles"),
          interceptions:            n("interceptions"),
          yellowCards:              n("yellowCards"),
          expectedGoals:            n("expectedGoals"),
          expectedAssists:          n("expectedAssists"),
        };
      }
    }
  }

  // Recent games
  const eventsData = await sofaFetch(`/player/${playerId}/events/last/0`);
  const recentGames = [];
  const vsOpponent  = [];

  if (eventsData) {
    const finished = (eventsData.events ?? []).filter(e => e.status?.type === "finished").slice(0, 8);
    for (const ev of finished) {
      const statsData = await sofaFetch(`/event/${ev.id}/player/${playerId}/statistics`);
      const ps = statsData?.statistics ?? statsData ?? {};
      const n  = k => typeof ps[k] === "number" ? ps[k] : null;
      const hs = ev.homeScore ?? {};
      const as_ = ev.awayScore ?? {};
      recentGames.push({
        eventId:       ev.id,
        date:          new Date((ev.startTimestamp ?? 0) * 1000).toISOString().slice(0, 10),
        homeTeam:      ev.homeTeam?.name ?? "",
        awayTeam:      ev.awayTeam?.name ?? "",
        homeScore:     hs.current ?? 0,
        awayScore:     as_.current ?? 0,
        homeTeamId:    ev.homeTeam?.id ?? 0,
        awayTeamId:    ev.awayTeam?.id ?? 0,
        playerTeamId:  null,
        goals:         n("goals"),
        assists:       n("goalAssist") ?? n("assists"),
        rating:        n("rating"),
        minutesPlayed: n("minutesPlayed") ?? (n("secondsPlayed") !== null ? Math.round((n("secondsPlayed") ?? 0) / 60) : null),
        shots:         n("totalShots") ?? n("totalShot"),
        shotsOnTarget: n("onTargetScoringAttempt"),
        keyPasses:     n("keyPass"),
        passes:        n("accuratePass"),
        passAccuracy:  n("accuratePassesPercentage"),
        tackles:       n("totalTackle") ?? n("tackles"),
        interceptions: n("interceptionWon") ?? n("interceptions"),
        yellowCards:   n("yellowCard"),
        foulsCommitted:n("foulsCommitted") ?? n("foulCommit"),
        saves:         n("saves") ?? n("totalSave"),
        xG:            n("expectedGoals"),
        xA:            n("expectedAssists"),
      });
    }
  }

  return { seasonStats, recentGames, vsOpponent };
}

// ─── Write helpers ────────────────────────────────────────────────────────────

function writeJSON(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[write] ${filePath.replace(REPO_ROOT + "/", "")}`);
}

function loadIndex() {
  const path = join(DATA_DIR, "index.json");
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return {}; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const specificGame = args.includes("--game") ? args[args.indexOf("--game") + 1] : null;
  const includeLive  = args.includes("--live");
  const dryRun       = args.includes("--dry-run");

  console.log("[collect-soccer] starting", { specificGame, includeLive });
  mkdirSync(EVENTS_DIR,  { recursive: true });
  mkdirSync(PLAYERS_DIR, { recursive: true });

  // Load existing ESPN → Sofascore ID index
  const index = loadIndex();
  let indexDirty = false;

  // Get upcoming games from ESPN
  let games = await fetchUpcomingGames(2);
  if (specificGame) {
    games = games.filter(g => g.espnGameId === specificGame || g.espnId === specificGame);
    if (games.length === 0) {
      console.warn(`[collect-soccer] game not found in ESPN scoreboard: ${specificGame}`);
      process.exit(0);
    }
  }
  if (!includeLive) {
    games = games.filter(g => g.status === "STATUS_SCHEDULED");
  }

  console.log(`[collect-soccer] ${games.length} games to process`);

  for (const game of games) {
    console.log(`\n──────────────────────────────────────────`);
    console.log(`[game] ${game.homeTeamName} vs ${game.awayTeamName} (${game.league}) @ ${game.kickoffISO}`);

    // Find Sofascore event ID
    let eventInfo = null;
    if (index[game.espnGameId]) {
      // Already known from a previous run — re-use but still fetch fresh data
      console.log(`[sofa] using cached sofascoreId ${index[game.espnGameId]}`);
      eventInfo = { sofascoreId: index[game.espnGameId] };
      // Try to get team/tournament IDs from existing file
      const existing = existsSync(join(EVENTS_DIR, `${index[game.espnGameId]}.json`))
        ? JSON.parse(readFileSync(join(EVENTS_DIR, `${index[game.espnGameId]}.json`), "utf8"))
        : null;
      if (existing) {
        eventInfo = { ...eventInfo, homeTeamId: existing.homeTeamId, awayTeamId: existing.awayTeamId, tournamentId: existing.tournamentId, seasonId: existing.seasonId };
      }
    } else {
      eventInfo = await findSofascoreEventId(game.homeTeamName, game.awayTeamName, game.kickoffISO);
      if (!eventInfo) {
        console.warn(`[sofa] event not found: ${game.homeTeamName} vs ${game.awayTeamName}`);
        continue;
      }
      index[game.espnGameId] = eventInfo.sofascoreId;
      indexDirty = true;
      console.log(`[sofa] event found: sofascoreId=${eventInfo.sofascoreId}`);
    }

    const { sofascoreId, homeTeamId, awayTeamId, tournamentId, seasonId } = eventInfo;

    // Fetch match data in parallel
    const [lineups, homeTeamStats, awayTeamStats, topScorers] = await Promise.all([
      fetchLineups(sofascoreId),
      (homeTeamId && tournamentId && seasonId) ? fetchTeamSeasonStats(homeTeamId, tournamentId, seasonId) : Promise.resolve(null),
      (awayTeamId && tournamentId && seasonId) ? fetchTeamSeasonStats(awayTeamId, tournamentId, seasonId) : Promise.resolve(null),
      (tournamentId && seasonId) ? fetchTopScorers(tournamentId, seasonId) : Promise.resolve([]),
    ]);

    if (lineups) {
      console.log(`[sofa] lineups: confirmed=${lineups.confirmed}, home=${lineups.home.length}, away=${lineups.away.length}`);
    } else {
      console.log(`[sofa] no lineups yet`);
    }

    // Write event file
    const eventData = {
      collectedAt:   new Date().toISOString(),
      sofascoreId,
      espnGameId:    game.espnGameId,
      homeTeamId:    homeTeamId ?? null,
      awayTeamId:    awayTeamId ?? null,
      tournamentId:  tournamentId ?? null,
      seasonId:      seasonId ?? null,
      lineups:       lineups ?? null,
      incidents:     [],            // only collected for live/finished games
      homeTeamStats: homeTeamStats ?? null,
      awayTeamStats: awayTeamStats ?? null,
      topScorers:    topScorers ?? [],
    };
    writeJSON(join(EVENTS_DIR, `${sofascoreId}.json`), eventData);

    // Fetch player data if lineups are available
    if (lineups && (lineups.home.length > 0 || lineups.away.length > 0)) {
      const allPlayers = [...lineups.home, ...lineups.away].filter(p => p.id > 0);
      console.log(`[sofa] fetching player data for ${allPlayers.length} players...`);

      // Process in batches of 5 to avoid hammering the API
      for (let i = 0; i < allPlayers.length; i += 5) {
        const batch = allPlayers.slice(i, i + 5);
        await Promise.all(batch.map(async player => {
          const playerData = await fetchPlayerData(player.id, tournamentId);
          writeJSON(join(PLAYERS_DIR, `${player.id}.json`), {
            collectedAt:  new Date().toISOString(),
            playerId:     player.id,
            playerName:   player.name,
            seasonStats:  playerData.seasonStats,
            recentGames:  playerData.recentGames,
            vsOpponent:   playerData.vsOpponent,
          });
        }));
        // Small delay between batches to be a good citizen
        if (i + 5 < allPlayers.length) await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // Update index file if new games were found
  if (indexDirty) {
    writeJSON(join(DATA_DIR, "index.json"), index);
  }

  // Git commit and push
  const changedFiles = await gitStatus();
  if (changedFiles.length === 0) {
    console.log("\n[git] no changes to commit");
    await closeBrowser();
    return;
  }

  if (dryRun) {
    console.log(`\n[git] --dry-run: skipping commit of ${changedFiles.length} changed files`);
    await closeBrowser();
    return;
  }

  console.log(`\n[git] committing ${changedFiles.length} changed files...`);
  try {
    await execFileAsync("git", ["-C", REPO_ROOT, "add", "data/soccer/"], { maxBuffer: 1024 * 1024 });
    const dateStr = new Date().toISOString().slice(0, 16).replace("T", " ");
    await execFileAsync("git", ["-C", REPO_ROOT, "commit", "-m", `data: soccer update ${dateStr}`], { maxBuffer: 1024 * 1024 });
    await execFileAsync("git", ["-C", REPO_ROOT, "push"], { maxBuffer: 1024 * 1024 });
    console.log("[git] pushed successfully");
  } catch (err) {
    console.error("[git] commit/push failed:", err.message);
  } finally {
    await closeBrowser();
  }
}

async function gitStatus() {
  try {
    const { stdout } = await execFileAsync("git", ["-C", REPO_ROOT, "status", "--porcelain", "data/soccer/"], { maxBuffer: 1024 * 1024 });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

main().catch(err => {
  console.error("[collect-soccer] fatal error:", err);
  process.exit(1);
});
