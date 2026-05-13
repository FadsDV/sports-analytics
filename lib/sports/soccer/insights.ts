/**
 * Soccer insight generation.
 * Converts raw analytics into human-readable deterministic "edges".
 */

import type { SoccerMatchAnalytics } from "./analytics";

export interface SoccerInsight {
  id:        string;
  title:     string;
  text:      string;
  severity:  "low" | "medium" | "high";
  direction: "home" | "away" | "neutral";
}

export function generateSoccerInsights(params: {
  analytics:     SoccerMatchAnalytics;
  homeShortName: string;
  awayShortName: string;
}): SoccerInsight[] {
  const { analytics, homeShortName, awayShortName } = params;
  const { home, away, h2h } = analytics;
  const out: SoccerInsight[] = [];
  let idx = 0;

  const add = (title: string, text: string, severity: SoccerInsight["severity"], direction: SoccerInsight["direction"]) => {
    out.push({ id: `soc-ins-${idx++}`, title, text, severity, direction });
  };

  // 1. H2H Dominance
  if (h2h.total >= 3) {
    if (h2h.homeWins > h2h.awayWins + 1) {
      add("H2H Advantage", `${homeShortName} have dominated recent meetings (${h2h.homeWins}-${h2h.awayWins})`, "medium", "home");
    } else if (h2h.awayWins > h2h.homeWins + 1) {
      add("H2H Advantage", `${awayShortName} have dominated recent meetings (${h2h.awayWins}-${h2h.homeWins})`, "medium", "away");
    }
  }

  // 2. Form Streaks
  if (home.streak.type === "W" && home.streak.count >= 3) {
    add("Hot Form", `${homeShortName} on a ${home.streak.count}-match winning streak`, "high", "home");
  }
  if (away.streak.type === "W" && away.streak.count >= 3) {
    add("Hot Form", `${awayShortName} on a ${away.streak.count}-match winning streak`, "high", "away");
  }

  // 3. Scoring/Defense Profiles
  if (home.avgScored > 2.0 && home.avgConceded < 1.0) {
    add("Elite Profile", `${homeShortName} averaging ${home.avgScored} goals while conceding only ${home.avgConceded}`, "medium", "home");
  }
  if (away.avgScored > 2.0 && away.avgConceded < 1.0) {
    add("Elite Profile", `${awayShortName} averaging ${away.avgScored} goals while conceding only ${away.avgConceded}`, "medium", "away");
  }

  // 4. Clean Sheets
  if (home.cleanSheetPct > 50) {
    add("Solid Defense", `${homeShortName} have kept clean sheets in ${home.cleanSheetPct}% of recent games`, "low", "home");
  }
  if (away.cleanSheetPct > 50) {
    add("Solid Defense", `${awayShortName} have kept clean sheets in ${away.cleanSheetPct}% of recent games`, "low", "away");
  }

  // 5. Rest Days
  if (home.daysRest !== null && away.daysRest !== null) {
    const diff = home.daysRest - away.daysRest;
    if (diff >= 3) {
      add("Rest Advantage", `${homeShortName} have ${diff} more days rest than ${awayShortName}`, "medium", "home");
    } else if (diff <= -3) {
      add("Rest Advantage", `${awayShortName} have ${Math.abs(diff)} more days rest than ${homeShortName}`, "medium", "away");
    }
  }

  return out.slice(0, 5);
}
