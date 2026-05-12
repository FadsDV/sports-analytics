import { Sport } from "@/lib/types";
import { AFL_TEAMS } from "./teams/afl";
import { CanonicalTeam } from "./types";

const ALL_TEAMS: Record<Sport, CanonicalTeam[]> = {
  afl: AFL_TEAMS,
  basketball: [], // NBA
  nfl: [],
  soccer: [],
  ucl: [],
  uel: [],
  laliga: [],
  bundesliga: [],
  aleague: [],
};

/**
 * Resolves a team name to its canonical ID
 */
export function resolveTeamCanonicalId(name: string, sport: Sport): string | null {
  if (!name) return null;

  const teams = ALL_TEAMS[sport];
  if (!teams) return null;

  const normalizedInput = normalizeString(name);

  // 1. Direct match on display name or short name
  const directMatch = teams.find(
    t => normalizeString(t.displayName) === normalizedInput || 
         normalizeString(t.shortName) === normalizedInput ||
         normalizeString(t.abbr) === normalizedInput
  );
  if (directMatch) return directMatch.id;

  // 2. Alias match
  const aliasMatch = teams.find(t => 
    t.aliases.some(alias => normalizeString(alias) === normalizedInput)
  );
  if (aliasMatch) return aliasMatch.id;

  // 3. Substring match (careful, but useful for things like "Adelaide Crows" matching "Adelaide")
  const substringMatch = teams.find(t => 
    normalizedInput.includes(normalizeString(t.shortName)) ||
    normalizeString(t.displayName).includes(normalizedInput)
  );
  
  if (substringMatch) return substringMatch.id;

  console.warn(`[TeamMapping] Failed to resolve canonical ID for: "${name}" (${sport})`);
  return null;
}

/**
 * Gets the canonical team definition by ID
 */
export function getCanonicalTeam(id: string, sport: Sport): CanonicalTeam | null {
  return ALL_TEAMS[sport]?.find(t => t.id === id) || null;
}

function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}
