/**
 * NBA match insight engine.
 * Pure functions — no side effects, no API calls.
 * Generates typed insights from NBA match analytics.
 * All insights are deterministic and sample-based.
 */

import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { NBAMatchAnalytics } from "./analytics";

export function generateNBAInsights(params: {
  analytics:     NBAMatchAnalytics;
  homeShortName: string;
  awayShortName: string;
}): AFLInsight[] {
  const { analytics, homeShortName, awayShortName } = params;
  const { home, away, h2h, restAdvantage } = analytics;
  const out: AFLInsight[] = [];
  let idx = 0;

  const mk = (
    title:     string,
    text:      string,
    direction: "home" | "away" | "neutral",
    severity:  "high" | "medium" | "low",
    category:  "form" | "rest" | "h2h" | "team-edge" | "matchup",
  ): AFLInsight => ({
    icon: "◆", text, id: `nba-${idx++}`,
    category, direction, severity, confidence: 70, title,
  });

  // Back-to-back (highest priority — reliable fatigue signal)
  if (home.isBackToBack) {
    out.push(mk("B2B fatigue", `${homeShortName} on second game of back-to-back`, "away", "high", "rest"));
  }
  if (away.isBackToBack) {
    out.push(mk("B2B fatigue", `${awayShortName} on second game of back-to-back`, "home", "high", "rest"));
  }

  // Rest advantage (only when not B2B and gap is meaningful)
  if (!home.isBackToBack && !away.isBackToBack && restAdvantage !== null && restAdvantage !== "even") {
    const homeRest = home.daysRest ?? 0;
    const awayRest = away.daysRest ?? 0;
    const diff = Math.abs(homeRest - awayRest);
    if (diff >= 2) {
      const favTeam = restAdvantage === "home" ? homeShortName : awayShortName;
      out.push(mk("Rest edge", `${favTeam} has ${diff} more rest days`, restAdvantage, "medium", "rest"));
    }
  }

  // Win streaks
  if (home.streak.type === "W" && home.streak.count >= 3) {
    out.push(mk("Win streak", `${homeShortName} on a ${home.streak.count}-game winning streak`, "home", "high", "form"));
  } else if (home.streak.type === "L" && home.streak.count >= 4) {
    out.push(mk("Losing streak", `${homeShortName} on a ${home.streak.count}-game losing streak`, "away", "medium", "form"));
  }
  if (away.streak.type === "W" && away.streak.count >= 3) {
    out.push(mk("Win streak", `${awayShortName} on a ${away.streak.count}-game winning streak`, "away", "high", "form"));
  } else if (away.streak.type === "L" && away.streak.count >= 4) {
    out.push(mk("Losing streak", `${awayShortName} on a ${away.streak.count}-game losing streak`, "home", "medium", "form"));
  }

  // H2H dominance (min 4 meetings for significance)
  if (h2h.total >= 4) {
    const hwPct = Math.round((h2h.homeWins / h2h.total) * 100);
    const awPct = 100 - hwPct;
    if (hwPct >= 70) {
      out.push(mk("H2H edge", `Home side wins ${hwPct}% of last ${h2h.total} meetings`, "home", "medium", "h2h"));
    } else if (awPct >= 70) {
      out.push(mk("H2H edge", `${awayShortName} wins ${awPct}% of last ${h2h.total} meetings`, "away", "medium", "h2h"));
    }
    if (h2h.streak && h2h.streak.count >= 3) {
      const dir = h2h.streak.team.includes(homeShortName) ? "home" : "away";
      out.push(mk("H2H streak", `${h2h.streak.team} on ${h2h.streak.count}-game H2H winning run`, dir, "medium", "h2h"));
    }
  }

  // Home court dominance
  const hHomeTotal = home.homeRecord.wins + home.homeRecord.losses;
  if (hHomeTotal >= 5) {
    const pct = Math.round((home.homeRecord.wins / hHomeTotal) * 100);
    if (pct >= 70) {
      out.push(mk("Home court", `${homeShortName} win ${pct}% at home this season`, "home", "medium", "team-edge"));
    }
  }

  // Win rate gap
  const wrdiff = home.winRate - away.winRate;
  if (Math.abs(wrdiff) >= 20 && home.record.wins + home.record.losses >= 10 && away.record.wins + away.record.losses >= 10) {
    const favTeam = wrdiff > 0 ? homeShortName : awayShortName;
    const dir: "home" | "away" = wrdiff > 0 ? "home" : "away";
    out.push(mk("Win rate gap", `${favTeam} win rate ${Math.max(home.winRate, away.winRate)}% vs ${Math.min(home.winRate, away.winRate)}%`, dir, "low", "matchup"));
  }

  return out.slice(0, 5);
}
