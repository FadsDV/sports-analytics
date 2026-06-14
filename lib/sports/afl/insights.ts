/**
 * AFL betting insight engine.
 * Pure functions — no side effects, no API calls.
 * Generates typed, scored, categorised insights from AFL match analytics.
 */

import type { AFLMatchAnalytics, AFLTeamAnalytics, AFLH2HSummary } from "./analytics";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightCategory =
  | "form"
  | "team-edge"
  | "venue"
  | "weather"
  | "rest"
  | "scoring"
  | "defense"
  | "injury"
  | "h2h"
  | "matchup";

export type InsightSeverity  = "high" | "medium" | "low";
export type InsightDirection = "home" | "away" | "neutral";

/** Backwards-compatible superset of the generic Insight type. */
export interface AFLInsight {
  // ── Legacy Insight fields ──────────────────────
  icon: string;
  text: string;
  // ── Rich metadata ──────────────────────────────
  id:         string;
  category:   InsightCategory;
  direction:  InsightDirection;
  severity:   InsightSeverity;
  confidence: number;    // 0–100, driven by sample size
  title:      string;    // short label e.g. "Winning streak"
  value?:     number;    // numeric signal e.g. +18 (pts differential)
}

interface WeatherData {
  condition: string;
  tempC:     number;
  windKph:   number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Confidence 0–100 from sample size — saturates at `satAt`. */
function conf(n: number, satAt = 10): number {
  return Math.min(100, Math.round((Math.max(0, n) / satAt) * 100));
}

function winPct(wins: number, losses: number): number {
  const t = wins + losses;
  return t > 0 ? wins / t : 0;
}

function opp(dir: InsightDirection): InsightDirection {
  return dir === "home" ? "away" : dir === "away" ? "home" : "neutral";
}

// ─── Generator: Form trends ───────────────────────────────────────────────────

function genFormTrend(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];

  for (const [a, name, dir] of [
    [ha, hName, "home" as InsightDirection],
    [aa, aName, "away" as InsightDirection],
  ] as const) {
    // Winning streak
    if (a.streak.type === "W" && a.streak.count >= 3) {
      out.push({
        icon: "◉", text: `${name} riding a ${a.streak.count}-game winning streak, averaging ${a.avgScored} pts/game`,
        id: "", category: "form", direction: dir,
        severity: a.streak.count >= 5 ? "high" : "medium",
        confidence: conf(a.streak.count, 6),
        title: "Winning streak",
        value: a.streak.count,
      });
    }
    // Losing streak
    if (a.streak.type === "L" && a.streak.count >= 3) {
      out.push({
        icon: "◉", text: `${name} winless in last ${a.streak.count} — momentum strongly against`,
        id: "", category: "form", direction: opp(dir),
        severity: a.streak.count >= 5 ? "high" : "medium",
        confidence: conf(a.streak.count, 6),
        title: "Losing streak",
        value: -a.streak.count,
      });
    }
    // 4-from-5 strong form (when not already captured by streak)
    const wins5 = a.form.filter(r => r === "W").length;
    const n5    = a.form.length;
    if (n5 >= 4 && wins5 >= 4 && a.streak.count < 3) {
      out.push({
        icon: "◈", text: `${name} in strong form — ${wins5} wins from last ${n5}`,
        id: "", category: "form", direction: dir,
        severity: "medium", confidence: conf(n5, 5),
        title: "Strong recent form", value: wins5,
      });
    }
    // Very poor form: ≤1 win from last 5
    if (n5 >= 4 && wins5 <= 1 && a.streak.count < 3) {
      out.push({
        icon: "◈", text: `${name} struggling — only ${wins5} win from last ${n5} games`,
        id: "", category: "form", direction: opp(dir),
        severity: "medium", confidence: conf(n5, 5),
        title: "Poor form", value: -wins5,
      });
    }
  }

  return out;
}

// ─── Generator: Team edges (season record, scoring differential) ───────────────

function genTeamEdge(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];

  const hTotal = ha.record.wins + ha.record.losses;
  const aTotal = aa.record.wins + aa.record.losses;
  const hPct   = winPct(ha.record.wins, ha.record.losses);
  const aPct   = winPct(aa.record.wins, aa.record.losses);

  // Season record gap
  if (hTotal >= 5 && aTotal >= 5) {
    const diff = hPct - aPct;
    if (Math.abs(diff) >= 0.25) {
      const favDir: InsightDirection = diff > 0 ? "home" : "away";
      const favName = diff > 0 ? hName : aName;
      const favPct  = diff > 0 ? Math.round(hPct * 100) : Math.round(aPct * 100);
      const undPct  = diff > 0 ? Math.round(aPct * 100) : Math.round(hPct * 100);
      const undName = diff > 0 ? aName : hName;
      out.push({
        icon: "◆",
        text: `${favName} winning ${favPct}% this season vs ${undName} at ${undPct}%`,
        id: "", category: "team-edge", direction: favDir,
        severity: Math.abs(diff) >= 0.35 ? "high" : "medium",
        confidence: conf(Math.min(hTotal, aTotal), 12),
        title: "Season record edge",
        value: Math.round(Math.abs(diff) * 100),
      });
    }
  }

  // Scoring differential (attack minus defence)
  if (ha.avgScored > 0 && aa.avgScored > 0) {
    const hDiff = ha.avgScored - ha.avgConceded;
    const aDiff = aa.avgScored - aa.avgConceded;
    if (hDiff >= 15 && hDiff > aDiff + 8) {
      out.push({
        icon: "◆",
        text: `${hName} averaging +${hDiff} pts scoring differential this season`,
        id: "", category: "team-edge", direction: "home",
        severity: hDiff >= 25 ? "high" : "medium",
        confidence: conf(hTotal, 10),
        title: "Scoring differential", value: hDiff,
      });
    } else if (aDiff >= 15 && aDiff > hDiff + 8) {
      out.push({
        icon: "◆",
        text: `${aName} averaging +${aDiff} pts scoring differential this season`,
        id: "", category: "team-edge", direction: "away",
        severity: aDiff >= 25 ? "high" : "medium",
        confidence: conf(aTotal, 10),
        title: "Scoring differential", value: aDiff,
      });
    }
  }

  return out;
}

// ─── Generator: Venue trends ──────────────────────────────────────────────────

function genVenueEdge(
  ha: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];

  // Match-specific venue record
  if (ha.venueRecord) {
    const { wins, losses } = ha.venueRecord;
    const n = wins + losses;
    if (n >= 3) {
      const pct = winPct(wins, losses);
      if (pct >= 0.65) {
        out.push({
          icon: "◈",
          text: `${hName} are ${wins}-${losses} at this venue — strong home ground record`,
          id: "", category: "venue", direction: "home",
          severity: pct >= 0.80 ? "high" : "medium",
          confidence: conf(n, 6),
          title: "Venue dominance", value: Math.round(pct * 100),
        });
      } else if (pct <= 0.35) {
        out.push({
          icon: "◈",
          text: `${hName} poor record at this venue (${wins}-${losses}) — ${aName} may benefit`,
          id: "", category: "venue", direction: "away",
          severity: "medium", confidence: conf(n, 6),
          title: "Venue struggles", value: Math.round(pct * 100),
        });
      }
    }
  }

  // Home-ground win rate this season
  const { wins: hw, losses: hl } = ha.homeRecord;
  const homeTotal = hw + hl;
  if (homeTotal >= 4) {
    const homePct = winPct(hw, hl);
    if (homePct >= 0.70) {
      out.push({
        icon: "◈",
        text: `${hName} win ${Math.round(homePct * 100)}% at home this season (${hw}-${hl})`,
        id: "", category: "venue", direction: "home",
        severity: homePct >= 0.80 ? "high" : "medium",
        confidence: conf(homeTotal, 6),
        title: "Home fortress", value: Math.round(homePct * 100),
      });
    }
  }

  return out;
}

// ─── Generator: Weather impact ────────────────────────────────────────────────

function genWeatherImpact(weather: WeatherData | null | undefined): AFLInsight[] {
  if (!weather || weather.condition === "Indoor") return [];
  const out: AFLInsight[] = [];

  if (weather.windKph >= 40) {
    out.push({
      icon: "💨",
      text: `Strong wind (${weather.windKph}km/h) — expect reduced kicking efficiency, more behinds, suppressed totals`,
      id: "", category: "weather", direction: "neutral",
      severity: "high", confidence: 90,
      title: "Strong wind", value: weather.windKph,
    });
  } else if (weather.windKph >= 25) {
    out.push({
      icon: "💨",
      text: `Moderate wind (${weather.windKph}km/h) may shift kick direction strategies and compress total scoring`,
      id: "", category: "weather", direction: "neutral",
      severity: "medium", confidence: 75,
      title: "Moderate wind", value: weather.windKph,
    });
  }

  if (["Rain", "Rain Showers", "Storm", "Drizzle"].includes(weather.condition)) {
    out.push({
      icon: "🌧️",
      text: `${weather.condition} forecast — wet grounds historically compress AFL scores by 15–20 pts per side`,
      id: "", category: "weather", direction: "neutral",
      severity: ["Storm", "Rain"].includes(weather.condition) ? "high" : "medium",
      confidence: 85,
      title: "Wet conditions",
    });
  }

  return out;
}

// ─── Generator: Rest disadvantages ───────────────────────────────────────────

function genRestEdge(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];
  const hr = ha.daysRest;
  const ar = aa.daysRest;

  if (hr != null && ar != null) {
    const diff = ar - hr;
    if (hr < 7 && diff >= 3) {
      out.push({
        icon: "⏱",
        text: `${hName} on short rest (${hr}d) vs ${aName} on ${ar}d — fatigue may be a factor`,
        id: "", category: "rest", direction: "away",
        severity: "high", confidence: 80,
        title: "Rest disadvantage", value: -diff,
      });
    } else if (ar < 7 && diff <= -3) {
      out.push({
        icon: "⏱",
        text: `${aName} on short rest (${ar}d) vs ${hName} on ${hr}d — ${hName} fresher`,
        id: "", category: "rest", direction: "home",
        severity: "high", confidence: 80,
        title: "Rest advantage", value: Math.abs(diff),
      });
    } else if (hr < 7) {
      out.push({
        icon: "⏱",
        text: `${hName} on only ${hr} days rest — watch for fatigue late in the game`,
        id: "", category: "rest", direction: "neutral",
        severity: "medium", confidence: 65,
        title: "Short rest", value: hr,
      });
    } else if (ar < 7) {
      out.push({
        icon: "⏱",
        text: `${aName} on only ${ar} days rest — watch for fatigue late in the game`,
        id: "", category: "rest", direction: "neutral",
        severity: "medium", confidence: 65,
        title: "Short rest", value: ar,
      });
    }
  } else if (hr != null && hr < 7) {
    out.push({
      icon: "⏱",
      text: `${hName} on only ${hr} days rest`,
      id: "", category: "rest", direction: "neutral",
      severity: "medium", confidence: 60,
      title: "Short rest", value: hr,
    });
  } else if (ar != null && ar < 7) {
    out.push({
      icon: "⏱",
      text: `${aName} on only ${ar} days rest`,
      id: "", category: "rest", direction: "neutral",
      severity: "medium", confidence: 60,
      title: "Short rest", value: ar,
    });
  }

  return out;
}

// ─── Generator: Scoring patterns ──────────────────────────────────────────────

function genScoringPattern(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];
  const hTotal = ha.record.wins + ha.record.losses;
  const aTotal = aa.record.wins + aa.record.losses;

  // High-scoring attack
  if (ha.avgScored >= 110 && hTotal >= 4) {
    out.push({
      icon: "🎯",
      text: `${hName} averaging ${ha.avgScored} pts/game — one of the competition's more potent attacks`,
      id: "", category: "scoring", direction: "home",
      severity: ha.avgScored >= 120 ? "high" : "medium",
      confidence: conf(hTotal, 10),
      title: "High-scoring attack", value: ha.avgScored,
    });
  }
  if (aa.avgScored >= 110 && aTotal >= 4) {
    out.push({
      icon: "🎯",
      text: `${aName} averaging ${aa.avgScored} pts/game — high-scoring threat coming in`,
      id: "", category: "scoring", direction: "away",
      severity: aa.avgScored >= 120 ? "high" : "medium",
      confidence: conf(aTotal, 10),
      title: "High-scoring attack", value: aa.avgScored,
    });
  }

  // Low-scoring / defensive pattern
  if (ha.avgScored <= 78 && hTotal >= 4) {
    out.push({
      icon: "🛡",
      text: `${hName} averaging only ${ha.avgScored} pts/game — expect a low-scoring grind`,
      id: "", category: "scoring", direction: "neutral",
      severity: "medium", confidence: conf(hTotal, 10),
      title: "Defensive matchup", value: ha.avgScored,
    });
  }
  if (aa.avgScored <= 78 && aTotal >= 4) {
    out.push({
      icon: "🛡",
      text: `${aName} averaging only ${aa.avgScored} pts/game — total may go under`,
      id: "", category: "scoring", direction: "neutral",
      severity: "medium", confidence: conf(aTotal, 10),
      title: "Defensive matchup", value: aa.avgScored,
    });
  }

  // Model-projected total (blended attack vs opponent defence)
  if (ha.avgScored > 0 && aa.avgScored > 0 && hTotal >= 4 && aTotal >= 4) {
    const homeExp = Math.round((ha.avgScored + aa.avgConceded) / 2);
    const awayExp = Math.round((aa.avgScored + ha.avgConceded) / 2);
    const total   = homeExp + awayExp;
    if (total >= 205) {
      out.push({
        icon: "📈",
        text: `Model projects a high-scoring contest (est. ~${total} combined pts) — both attacks in form`,
        id: "", category: "scoring", direction: "neutral",
        severity: "medium", confidence: conf(Math.min(hTotal, aTotal), 8),
        title: "High total projected", value: total,
      });
    } else if (total <= 160) {
      out.push({
        icon: "📉",
        text: `Model projects a low-scoring contest (est. ~${total} combined pts) — strong defences expected`,
        id: "", category: "scoring", direction: "neutral",
        severity: "medium", confidence: conf(Math.min(hTotal, aTotal), 8),
        title: "Low total projected", value: total,
      });
    }
  }

  return out;
}

// ─── Generator: Defensive vulnerabilities ─────────────────────────────────────

function genDefensiveVuln(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];
  const hTotal = ha.record.wins + ha.record.losses;
  const aTotal = aa.record.wins + aa.record.losses;

  if (ha.avgConceded >= 108 && hTotal >= 4) {
    out.push({
      icon: "🔓",
      text: `${hName} concede ${ha.avgConceded} pts/game — ${aName} attack should find opportunities`,
      id: "", category: "defense", direction: "away",
      severity: ha.avgConceded >= 115 ? "high" : "medium",
      confidence: conf(hTotal, 10),
      title: "Defensive leakage", value: ha.avgConceded,
    });
  }
  if (aa.avgConceded >= 108 && aTotal >= 4) {
    out.push({
      icon: "🔓",
      text: `${aName} concede ${aa.avgConceded} pts/game — ${hName} attack likely to threaten`,
      id: "", category: "defense", direction: "home",
      severity: aa.avgConceded >= 115 ? "high" : "medium",
      confidence: conf(aTotal, 10),
      title: "Defensive leakage", value: aa.avgConceded,
    });
  }

  // Prone to blowout losses
  if (ha.avgMarginLoss >= 35 && ha.record.losses >= 3) {
    out.push({
      icon: "📉",
      text: `When beaten, ${hName} lose by an average of ${ha.avgMarginLoss} pts — prone to heavy defeats`,
      id: "", category: "defense", direction: "away",
      severity: "medium", confidence: conf(ha.record.losses, 5),
      title: "Heavy defeats", value: ha.avgMarginLoss,
    });
  }
  if (aa.avgMarginLoss >= 35 && aa.record.losses >= 3) {
    out.push({
      icon: "📉",
      text: `When beaten, ${aName} lose by an average of ${aa.avgMarginLoss} pts — prone to heavy defeats`,
      id: "", category: "defense", direction: "home",
      severity: "medium", confidence: conf(aa.record.losses, 5),
      title: "Heavy defeats", value: aa.avgMarginLoss,
    });
  }

  return out;
}

// ─── Generator: Injury signals ────────────────────────────────────────────────

function genInjurySignal(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];

  for (const [a, name, dir] of [
    [ha, hName, "home" as InsightDirection],
    [aa, aName, "away" as InsightDirection],
  ] as const) {
    const { out: injured, doubtful } = a.injuryImpact;
    if (injured.length >= 2) {
      out.push({
        icon: "🚑",
        text: `${name} missing ${injured.length} confirmed players — significant depth concerns`,
        id: "", category: "injury", direction: opp(dir),
        severity: injured.length >= 3 ? "high" : "medium",
        confidence: 95,
        title: "Injury crisis", value: -injured.length,
      });
    } else if (injured.length === 1) {
      out.push({
        icon: "🚑",
        text: `${injured[0]?.playerName ?? "Key player"} confirmed out for ${name}`,
        id: "", category: "injury", direction: opp(dir),
        severity: "medium", confidence: 95,
        title: "Key absence", value: -1,
      });
    } else if (doubtful.length >= 2) {
      out.push({
        icon: "🚑",
        text: `${name} have ${doubtful.length} doubtful players — availability uncertain at selection`,
        id: "", category: "injury", direction: "neutral",
        severity: "low", confidence: 70,
        title: "Squad concerns", value: -doubtful.length,
      });
    }
  }

  return out;
}

// ─── Generator: H2H edge ──────────────────────────────────────────────────────

function genH2HEdge(
  h2h: AFLH2HSummary,
  hName: string, aName: string,
): AFLInsight[] {
  if (h2h.total < 3) return [];
  const out: AFLInsight[] = [];

  // Consecutive H2H winning streak
  if (h2h.streak && h2h.streak.count >= 3) {
    const isHome = h2h.streak.team === hName;
    out.push({
      icon: "◇",
      text: `${h2h.streak.team} have won the last ${h2h.streak.count} H2H meetings between these sides`,
      id: "", category: "h2h", direction: isHome ? "home" : "away",
      severity: h2h.streak.count >= 5 ? "high" : "medium",
      confidence: conf(h2h.streak.count, 6),
      title: "H2H streak", value: h2h.streak.count,
    });
  }

  // H2H series dominance (≥5 meetings)
  if (h2h.total >= 5) {
    const hPct = winPct(h2h.homeWins, h2h.awayWins);
    if (hPct >= 0.65) {
      out.push({
        icon: "◇",
        text: `${hName} lead the H2H series ${h2h.homeWins}–${h2h.awayWins} (${Math.round(hPct * 100)}% win rate)`,
        id: "", category: "h2h", direction: "home",
        severity: hPct >= 0.75 ? "high" : "medium",
        confidence: conf(h2h.total, 8),
        title: "H2H dominance", value: Math.round(hPct * 100),
      });
    } else if (hPct <= 0.35) {
      const aPct = 1 - hPct;
      out.push({
        icon: "◇",
        text: `${aName} lead the H2H series ${h2h.awayWins}–${h2h.homeWins} — historically strong in this fixture`,
        id: "", category: "h2h", direction: "away",
        severity: aPct >= 0.75 ? "high" : "medium",
        confidence: conf(h2h.total, 8),
        title: "H2H dominance", value: Math.round(aPct * 100),
      });
    }
  }

  // Average H2H winning margin
  if (h2h.meetings.length >= 3) {
    const avgMargin = Math.round(
      h2h.meetings.reduce((s, m) => s + m.margin, 0) / h2h.meetings.length,
    );
    if (avgMargin >= 30) {
      const fav = h2h.homeWins > h2h.awayWins ? hName : aName;
      out.push({
        icon: "◇",
        text: `H2H meetings average a ${avgMargin}-pt margin — ${fav} often wins convincingly in this fixture`,
        id: "", category: "h2h", direction: h2h.homeWins > h2h.awayWins ? "home" : "away",
        severity: "medium", confidence: conf(h2h.meetings.length, 5),
        title: "Large H2H margins", value: avgMargin,
      });
    }
  }

  return out;
}

// ─── Generator: Matchup mismatches (attack vs opponent defence) ───────────────

function genMatchupMismatch(
  ha: AFLTeamAnalytics, aa: AFLTeamAnalytics,
  hName: string, aName: string,
): AFLInsight[] {
  const out: AFLInsight[] = [];
  const hTotal = ha.record.wins + ha.record.losses;
  const aTotal = aa.record.wins + aa.record.losses;
  if (hTotal < 4 || aTotal < 4) return out;

  // Home attack vs away defence
  const homeEdge = ha.avgScored - aa.avgConceded;
  if (homeEdge >= 15) {
    out.push({
      icon: "⚡",
      text: `${hName} avg scored (${ha.avgScored}) well above ${aName}'s avg conceded (${aa.avgConceded}) — home attack has the edge`,
      id: "", category: "matchup", direction: "home",
      severity: homeEdge >= 25 ? "high" : "medium",
      confidence: conf(Math.min(hTotal, aTotal), 10),
      title: "Attack-defence mismatch", value: Math.round(homeEdge),
    });
  } else if (homeEdge <= -15) {
    out.push({
      icon: "⚡",
      text: `${aName}'s defence (${aa.avgConceded} conceded) likely to contain ${hName}'s attack (${ha.avgScored} avg)`,
      id: "", category: "matchup", direction: "away",
      severity: homeEdge <= -25 ? "high" : "medium",
      confidence: conf(Math.min(hTotal, aTotal), 10),
      title: "Defensive mismatch", value: Math.round(-homeEdge),
    });
  }

  // Away attack vs home defence
  const awayEdge = aa.avgScored - ha.avgConceded;
  if (awayEdge >= 15) {
    out.push({
      icon: "⚡",
      text: `${aName} avg scored (${aa.avgScored}) well above ${hName}'s avg conceded (${ha.avgConceded}) — away attack dangerous`,
      id: "", category: "matchup", direction: "away",
      severity: awayEdge >= 25 ? "high" : "medium",
      confidence: conf(Math.min(hTotal, aTotal), 10),
      title: "Attack-defence mismatch", value: Math.round(awayEdge),
    });
  }

  return out;
}

// ─── Sort score ───────────────────────────────────────────────────────────────

function sortScore(ins: AFLInsight): number {
  const s = ins.severity === "high" ? 300 : ins.severity === "medium" ? 200 : 100;
  return s + ins.confidence;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface GenerateAFLInsightsParams {
  analytics:     AFLMatchAnalytics;
  homeShortName: string;
  awayShortName: string;
  weather?:      WeatherData | null;
}

export function generateAFLInsights({
  analytics, homeShortName, awayShortName, weather,
}: GenerateAFLInsightsParams): AFLInsight[] {
  const { home: ha, away: aa, h2h } = analytics;

  const all: AFLInsight[] = [
    ...genFormTrend(ha, aa, homeShortName, awayShortName),
    ...genTeamEdge(ha, aa, homeShortName, awayShortName),
    ...genVenueEdge(ha, homeShortName, awayShortName),
    ...genWeatherImpact(weather),
    ...genRestEdge(ha, aa, homeShortName, awayShortName),
    ...genScoringPattern(ha, aa, homeShortName, awayShortName),
    ...genDefensiveVuln(ha, aa, homeShortName, awayShortName),
    ...genInjurySignal(ha, aa, homeShortName, awayShortName),
    ...genH2HEdge(h2h, homeShortName, awayShortName),
    ...genMatchupMismatch(ha, aa, homeShortName, awayShortName),
  ];

  // Assign deterministic IDs after collection
  const sorted = all
    .sort((a, b) => sortScore(b) - sortScore(a))
    .slice(0, 10)
    .map((ins, i) => ({ ...ins, id: `afl-${i}` }));

  return sorted;
}
