/**
 * AFL Club Roster Provider
 *
 * Source of truth: official AFL club websites (server-rendered HTML).
 * These pages are published and maintained by AFL Digital for each club
 * and reflect the current contracted list — no Fantasy lag, no ESPN bias.
 *
 * ESPN is NEVER consulted for squad membership.
 * AFL Fantasy is NEVER consulted for squad membership.
 *
 * Data extracted per player:
 *   - Champion Data numeric ID  (data-player attribute → matches portrait CDN)
 *   - Jersey number             (player-item__jumper-number)
 *   - First name                (player-item__name text node)
 *   - Last name                 (player-item__last-name span)
 *   - Position (full text)      (player-item__position span)
 *   - Headshot URL              (AFL CDN, constructed from Champion Data ID)
 *
 * Caching: module-level Map with 3-hour TTL per team, preventing redundant
 * scrapes across requests within the same server process lifetime.
 */

import { getAFLCDNPortraitUrl } from "./champIDImages";
import { normalizeAFLName } from "./fantasyMapper";
import type { ESPNPlayer } from "../espnPlayers";

// ── Club squad page URLs (ESPN team ID → official club URL) ───────────────────
// Verified May 2026. Update if clubs move their squad page.
export const CLUB_SQUAD_URLS: Record<string, string> = {
  "1":  "https://www.fremantlefc.com.au/teams/afl",
  "2":  "https://www.melbournefc.com.au/teams/afl",
  "3":  "https://www.westcoasteagles.com.au/teams/afl/players",
  "4":  "https://www.sydneyswans.com.au/teams/afl",
  "5":  "https://www.nmfc.com.au/teams/afl/players",
  "6":  "https://www.westernbulldogs.com.au/teams/afl",
  "7":  "https://www.portadelaidefc.com.au/teams/afl",
  "8":  "https://www.gwsgiants.com.au/teams/afl",
  "9":  "https://www.carltonfc.com.au/teams/afl",
  "10": "https://www.goldcoastfc.com.au/teams/afl/players",
  "11": "https://www.lions.com.au/teams/afl/squad",
  "12": "https://www.richmondfc.com.au/football/afl/squad",
  "13": "https://www.hawthornfc.com.au/teams/afl",
  "14": "https://www.geelongcats.com.au/teams/afl",
  "15": "https://www.afc.com.au/teams/afl",
  "16": "https://www.essendonfc.com.au/teams/afl",
  "17": "https://www.collingwoodfc.com.au/teams/afl",
  "18": "https://www.saints.com.au/afl/squad",
};

// ── Scraped player shape ──────────────────────────────────────────────────────

export interface ClubRosterPlayer {
  champId:      string;   // Champion Data numeric ID (= AFL CDN portrait ID)
  jersey:       string;   // Guernsey number (string, may be "0"-padded on page)
  firstName:    string;
  lastName:     string;
  displayName:  string;
  normName:     string;   // normalizeAFLName(displayName) for cross-referencing
  position:     string;   // Full position label e.g. "Key Defender", "Midfielder"
  positionAbbr: string;   // Short abbreviation derived from position label
  headshot:     string;   // AFL CDN portrait URL
}

// ── Position label → abbreviation mapping ─────────────────────────────────────

const POS_ABBR: Array<[RegExp, string]> = [
  [/key.?forward/i,    "KF"],
  [/key.?defender/i,   "KD"],
  [/small.?forward/i,  "SF"],
  [/med.?defender/i,   "MD"],
  [/mid.?forward/i,    "MF"],
  [/midfielder/i,      "MID"],
  [/defender/i,        "DEF"],
  [/forward/i,         "FWD"],
  [/ruck/i,            "RUC"],
];

function abbrevPosition(full: string): string {
  for (const [re, abbr] of POS_ABBR) {
    if (re.test(full)) return abbr;
  }
  return full.slice(0, 3).toUpperCase() || "??";
}

// ── HTML parser ───────────────────────────────────────────────────────────────
// The AFL Digital CMS renders the same widget structure across all 18 club sites.
// Each player card lives in a <li class="squad-list__item"> element containing:
//   - data-player="{champId}"         on .js-player-image div
//   - player-item__jumper-number span → jersey number
//   - player-item__name h1            → first name (text node) + last-name span
//   - player-item__last-name span     → last name
//   - player-item__position span      → position label

const RE_ITEM     = /squad-list__item[\s\S]*?(?=squad-list__item|<\/ul)/g;
const RE_CHAMP_ID = /data-player="(\d+)"/;
const RE_JERSEY   = /player-item__jumper-number[^>]*>(\d+)/;
const RE_FIRST    = /player-item__name[^>]*>\s*([A-Za-zÀ-öø-ÿ'\-]+)/;
const RE_LAST     = /player-item__last-name[^>]*>([^<]+)/;
const RE_POSITION = /player-item__position[^>]*>([^<]+)/;

function parseSquadHtml(html: string): ClubRosterPlayer[] {
  const players: ClubRosterPlayer[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  RE_ITEM.lastIndex = 0;
  while ((match = RE_ITEM.exec(html)) !== null) {
    const chunk = match[0];

    const champId  = RE_CHAMP_ID.exec(chunk)?.[1] ?? "";
    const jersey   = RE_JERSEY.exec(chunk)?.[1]?.replace(/^0+/, "") ?? "";
    const first    = RE_FIRST.exec(chunk)?.[1]?.trim() ?? "";
    const last     = RE_LAST.exec(chunk)?.[1]?.trim() ?? "";
    const posFull  = RE_POSITION.exec(chunk)?.[1]?.trim() ?? "";

    if (!first && !last) continue;

    const displayName = `${first} ${last}`.trim();
    const normName    = normalizeAFLName(displayName);

    // Deduplicate by normName (some pages repeat players across sections)
    if (!normName || seen.has(normName)) continue;
    seen.add(normName);

    players.push({
      champId,
      jersey,
      firstName:    first,
      lastName:     last,
      displayName,
      normName,
      position:     posFull,
      positionAbbr: abbrevPosition(posFull),
      headshot:     champId ? getAFLCDNPortraitUrl(champId) : "",
    });
  }

  return players;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  players:   ClubRosterPlayer[];
  fetchedAt: number;
}

const CACHE     = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60 * 3; // 3 hours

// ── Main fetch ────────────────────────────────────────────────────────────────

/**
 * Scrapes the official club squad page for a given ESPN team ID.
 * Results are cached for 3 hours. Falls back to an empty array on network error.
 */
export async function fetchClubRoster(espnTeamId: string): Promise<ClubRosterPlayer[]> {
  const now = Date.now();
  const cached = CACHE.get(espnTeamId);
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return cached.players;
  }

  const url = CLUB_SQUAD_URLS[espnTeamId];
  if (!url) {
    console.warn(`[SportsPulse] AFL club roster: no URL mapped for ESPN team ${espnTeamId}`);
    return [];
  }

  try {
    const res = await fetch(url, {
      // Next.js data cache: revalidate every 3 hours across serverless cold starts
      next: { revalidate: 10800 },
      headers: {
        "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept":          "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.error(`[SportsPulse] AFL club roster HTTP ${res.status} for ${url}`);
      return cached?.players ?? [];
    }

    const html    = await res.text();
    const players = parseSquadHtml(html);

    CACHE.set(espnTeamId, { players, fetchedAt: now });

    // Debug logging (required by spec)
    const first10 = players.slice(0, 10).map(p => p.displayName);
    console.info(
      `[SportsPulse] AFL club roster scraped | source:${url} | ` +
      `ESPN-team:${espnTeamId} | count:${players.length}`
    );
    console.info(`[SportsPulse] AFL club roster first 10: ${first10.join(", ")}`);

    return players;

  } catch (err) {
    console.error(`[SportsPulse] AFL club roster fetch error for team ${espnTeamId}:`, err);
    return cached?.players ?? [];
  }
}

// ── ESPNPlayer adapter ────────────────────────────────────────────────────────

/**
 * Fetches the official club roster and returns it shaped as ESPNPlayer[].
 * espnIdMap: normalizedName → ESPN athlete ID (from ESPN roster fetch).
 * ESPN IDs are needed for player analytics but do NOT affect who appears in the list.
 */
export async function fetchClubRosterAsESPNPlayers(
  espnTeamId: string,
  espnIdMap:  Map<string, string>
): Promise<ESPNPlayer[]> {
  const roster = await fetchClubRoster(espnTeamId);

  return roster.map(p => ({
    id:           espnIdMap.get(p.normName) ?? "",
    displayName:  p.displayName,
    jersey:       p.jersey || undefined,
    position:     p.positionAbbr,
    positionFull: p.position,
    seasonStats:  {},
    headshot:     p.headshot,
  }));
}
