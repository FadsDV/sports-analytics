/**
 * Canonical eSports Mappings
 * 
 * Provides deterministic mapping between external IDs (PandaScore, etc.)
 * and internal canonical IDs.
 * 
 * Example: cs2.navi, cs2.faze, lol.t1, lol.geng
 */

export const TEAM_MAPPINGS: Record<string, string> = {
  // CS2
  "Navi": "cs2.navi",
  "Natus Vincere": "cs2.navi",
  "FaZe": "cs2.faze",
  "FaZe Clan": "cs2.faze",
  "Vitality": "cs2.vitality",
  "G2": "cs2.g2",
  "Astralis": "cs2.astralis",
  
  // LoL
  "T1": "lol.t1",
  "Gen.G": "lol.geng",
  "G2 Esports": "lol.g2",
  "Fnatic": "lol.fnatic",
  "Cloud9": "lol.c9",
};

export const PLAYER_MAPPINGS: Record<string, string> = {
  // CS2
  "s1mple": "cs2.s1mple",
  "ZywOo": "cs2.zywoo",
  "ropz": "cs2.ropz",
  
  // LoL
  "Faker": "lol.faker",
  "Chovy": "lol.chovy",
  "Caps": "lol.caps",
};

/**
 * Returns the canonical ID for a team name.
 * No fuzzy matching as per requirements.
 */
export function getCanonicalTeamId(name: string): string | undefined {
  return TEAM_MAPPINGS[name];
}

/**
 * Returns the canonical ID for a player handle.
 * No fuzzy matching as per requirements.
 */
export function getCanonicalPlayerId(handle: string): string | undefined {
  return PLAYER_MAPPINGS[handle];
}

export function generateInternalId(sport: 'cs2' | 'lol', identifier: string): string {
  return `${sport}.${identifier.toLowerCase().replace(/\s+/g, '_')}`;
}
