export const ORG_MAPPINGS: Record<string, string> = {
  "Natus Vincere": "org.navi",
  "FaZe Clan": "org.faze",
  "Team Vitality": "org.vitality",
  "G2 Esports": "org.g2",
  "T1": "org.t1",
  "Gen.G": "org.geng",
};

export const TEAM_MAPPINGS: Record<string, Record<string, string>> = {
  cs2: {
    "Navi": "cs2.navi",
    "Natus Vincere": "cs2.navi",
    "FaZe": "cs2.faze",
    "FaZe Clan": "cs2.faze",
    "Vitality": "cs2.vitality",
    "Team Vitality": "cs2.vitality",
    "G2": "cs2.g2",
    "G2 Esports": "cs2.g2",
    "Astralis": "cs2.astralis",
    "MOUZ": "cs2.mouz",
    "Spirit": "cs2.spirit",
  },
  lol: {
    "T1": "lol.t1",
    "Gen.G": "lol.geng",
    "G2 Esports": "lol.g2",
    "Fnatic": "lol.fnatic",
    "Cloud9": "lol.c9",
    "JD Gaming": "lol.jdg",
    "Bilibili Gaming": "lol.blg",
  }
};

export const PLAYER_MAPPINGS: Record<string, Record<string, string>> = {
  cs2: {
    "s1mple": "cs2.s1mple",
    "ZywOo": "cs2.zywoo",
    "ropz": "cs2.ropz",
    "m0NESY": "cs2.m0nesy",
    "donk": "cs2.donk",
  },
  lol: {
    "Faker": "lol.faker",
    "Chovy": "lol.chovy",
    "Caps": "lol.caps",
    "Gumayusi": "lol.gumayusi",
    "Keria": "lol.keria",
  }
};

export const TOURNAMENT_MAPPINGS: Record<string, string> = {
  "PGL Major": "tournament.pgl_major",
  "IEM Katowice": "tournament.iem_katowice",
  "IEM Cologne": "tournament.iem_cologne",
  "Worlds": "tournament.lol_worlds",
  "MSI": "tournament.lol_msi",
  "LEC": "tournament.lec",
  "LCK": "tournament.lck",
  "LPL": "tournament.lpl",
  "LCS": "tournament.lcs",
};

export const REGION_MAPPINGS: Record<string, string> = {
  "EU": "region.europe",
  "NA": "region.north_america",
  "KR": "region.korea",
  "CN": "region.china",
  "CIS": "region.cis",
};

/**
 * Returns the canonical ID for a team name.
 */
export function getCanonicalTeamId(name: string, gameType?: 'cs2' | 'lol'): string | undefined {
  if (gameType && TEAM_MAPPINGS[gameType]) {
    return TEAM_MAPPINGS[gameType][name];
  }
  // Fallback to searching all games if gameType not provided
  return TEAM_MAPPINGS.cs2[name] || TEAM_MAPPINGS.lol[name];
}

/**
 * Returns the canonical ID for a player handle.
 */
export function getCanonicalPlayerId(handle: string, gameType?: 'cs2' | 'lol'): string | undefined {
  if (gameType && PLAYER_MAPPINGS[gameType]) {
    return PLAYER_MAPPINGS[gameType][handle];
  }
  return PLAYER_MAPPINGS.cs2[handle] || PLAYER_MAPPINGS.lol[handle];
}

/**
 * Returns the canonical ID for an organization.
 */
export function getCanonicalOrgId(name: string): string | undefined {
  return ORG_MAPPINGS[name];
}

/**
 * Returns the canonical ID for a tournament.
 */
export function getCanonicalTournamentId(name: string): string | undefined {
  // Partial match for tournaments often necessary but we try to keep it deterministic
  for (const [key, value] of Object.entries(TOURNAMENT_MAPPINGS)) {
    if (name.includes(key)) return value;
  }
  return undefined;
}

export function generateInternalId(sport: 'cs2' | 'lol' | 'org' | 'region' | 'tournament', identifier: string): string {
  return `${sport}.${identifier.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Converts a raw string (PandaScore slug, name, handle) to a canonical URL-safe
 * lowercase identifier segment. Hyphens and spaces become underscores; all other
 * non-alphanumeric characters are stripped.
 *
 * Examples:
 *   "natus-vincere" → "natus_vincere"
 *   "Team Liquid"   → "team_liquid"
 *   "m0NESY"        → "m0nesy"
 */
export function normalizeEsportsSlug(raw: string): string {
  return raw.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Resolves a canonical team ID in the format `{gameType}.{short_name}`.
 *
 * Resolution order:
 *   1. TEAM_MAPPINGS name lookup (human-curated, highest quality)
 *   2. Normalized PandaScore slug  (stable, deterministic)
 *   3. Numeric ID sentinel         (last resort)
 *
 * Both lib/sports/cs2/client.ts and lib/providers/esports/pandascore/normalization.ts
 * must call this to guarantee identical IDs for the same team.
 */
export function resolveCanonicalTeamId(
  team: { name?: string | null; slug?: string | null; id?: number | string | null },
  gameType: 'cs2' | 'lol',
): string {
  if (team.name) {
    const mapped = getCanonicalTeamId(team.name, gameType);
    if (mapped) return mapped;
  }
  if (team.slug) return `${gameType}.${normalizeEsportsSlug(team.slug)}`;
  return `${gameType}.team_${team.id ?? 'unknown'}`;
}

/**
 * Resolves a canonical player ID in the format `{gameType}.{handle}`.
 *
 * Checks PLAYER_MAPPINGS by handle/name, then falls back to normalized slug or
 * numeric sentinel. The `handle` field takes priority over `name` for the mapping
 * lookup since PandaScore `name` is the in-game handle.
 */
export function resolveCanonicalPlayerId(
  player: { name?: string | null; handle?: string | null; slug?: string | null; id?: number | string | null },
  gameType: 'cs2' | 'lol',
): string {
  const handle = player.handle ?? player.name;
  if (handle) {
    const mapped = getCanonicalPlayerId(handle, gameType);
    if (mapped) return mapped;
  }
  if (player.slug) return `${gameType}.${normalizeEsportsSlug(player.slug)}`;
  const nameSlug = handle ? normalizeEsportsSlug(handle) : undefined;
  if (nameSlug) return `${gameType}.${nameSlug}`;
  return `${gameType}.player_${player.id ?? 'unknown'}`;
}

/**
 * Resolves a canonical tournament ID in the format `tournament.{slug}`.
 *
 * Uses TOURNAMENT_MAPPINGS (partial-name match) first, then the normalized slug,
 * then a numeric sentinel.
 */
export function resolveCanonicalTournamentId(
  tournament: { name?: string | null; slug?: string | null; id?: number | string | null },
): string {
  if (tournament.name) {
    const mapped = getCanonicalTournamentId(tournament.name);
    if (mapped) return mapped;
  }
  if (tournament.slug) return `tournament.${normalizeEsportsSlug(tournament.slug)}`;
  return `tournament.${tournament.id ?? 'unknown'}`;
}

/**
 * Returns the canonical match ID: `{gameType}.match.{numericId}`.
 *
 * The gameType prefix lets analytics functions and caches partition by game
 * without risk of numeric ID collision across providers.
 */
export function resolveCanonicalMatchId(
  matchId: number | string,
  gameType: 'cs2' | 'lol',
): string {
  return `${gameType}.match.${matchId}`;
}
