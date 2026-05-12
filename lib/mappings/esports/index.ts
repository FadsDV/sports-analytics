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
