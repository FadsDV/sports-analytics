/**
 * Bet risk calculator — derives Low / Medium / High rating
 * from real data: team records, form, weather, injuries, H2H.
 */

import { BetRisk, FormResult, RiskLevel, Team, Weather } from "@/lib/types";

function formPts(form: FormResult[]): number {
  return form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
}

function winPct(w: number, l: number, d = 0): number {
  const t = w + l + d;
  return t > 0 ? w / t : 0.5;
}

export function calcBetRisk(
  homeTeam:      Team,
  awayTeam:      Team,
  weather:       Weather,
  injuredCount:  number   = 0,
  h2hHomeWins:   number   = 0,
  h2hTotal:      number   = 0,
): BetRisk {
  let score = 40; // baseline: medium uncertainty
  const factors: BetRisk["factors"] = [];

  // ── 1. Recent form gap ────────────────────────────────────────────
  const hfp = formPts(homeTeam.form);
  const afp = formPts(awayTeam.form);
  if (homeTeam.form.length > 0 && awayTeam.form.length > 0) {
    const diff = Math.abs(hfp - afp);
    if (diff >= 9) {
      score -= 14;
      const leader = hfp > afp ? homeTeam.shortName : awayTeam.shortName;
      factors.push({ label: "Clear form leader", value: `${leader} significantly better in last 5 (${hfp} vs ${afp} pts)`, impact: "positive" });
    } else if (diff >= 5) {
      score += 5;
      factors.push({ label: "Moderate form gap", value: `${homeTeam.shortName} ${hfp}pts vs ${awayTeam.shortName} ${afp}pts last 5`, impact: "neutral" });
    } else {
      score += 18;
      factors.push({ label: "Evenly matched form", value: `${hfp} vs ${afp} pts — very close, outcome hard to predict`, impact: "negative" });
    }
  }

  // ── 2. Home team home record ──────────────────────────────────────
  const hr   = homeTeam.splits.home;
  const hrPct = winPct(hr.wins, hr.losses, hr.draws);
  if (hr.wins + hr.losses > 2) {
    if (hrPct >= 0.65) {
      score -= 10;
      factors.push({ label: "Home fortress", value: `${homeTeam.shortName} wins ${Math.round(hrPct * 100)}% at home (${hr.wins}W-${hr.losses}L)`, impact: "positive" });
    } else if (hrPct <= 0.33) {
      score += 12;
      factors.push({ label: "Weak home record", value: `${homeTeam.shortName} only ${Math.round(hrPct * 100)}% wins at home`, impact: "negative" });
    } else {
      factors.push({ label: "Average home record", value: `${homeTeam.shortName} ${Math.round(hrPct * 100)}% at home`, impact: "neutral" });
    }
  }

  // ── 3. Away team away record ──────────────────────────────────────
  const ar    = awayTeam.splits.away;
  const arPct = winPct(ar.wins, ar.losses, ar.draws);
  if (ar.wins + ar.losses > 2) {
    if (arPct >= 0.55) {
      score += 10; // dangerous away side increases uncertainty
      factors.push({ label: "Strong away side", value: `${awayTeam.shortName} wins ${Math.round(arPct * 100)}% on the road — genuine threat`, impact: "negative" });
    } else if (arPct <= 0.25) {
      score -= 8;
      factors.push({ label: "Poor away record", value: `${awayTeam.shortName} wins only ${Math.round(arPct * 100)}% away`, impact: "positive" });
    } else {
      factors.push({ label: "Average away record", value: `${awayTeam.shortName} ${Math.round(arPct * 100)}% wins away`, impact: "neutral" });
    }
  }

  // ── 4. H2H history ───────────────────────────────────────────────
  if (h2hTotal >= 3) {
    const h2hPct = h2hHomeWins / h2hTotal;
    if (h2hPct >= 0.65) {
      score -= 8;
      factors.push({ label: "Dominates H2H", value: `${homeTeam.shortName} won ${h2hHomeWins}/${h2hTotal} recent meetings`, impact: "positive" });
    } else if (h2hPct <= 0.30) {
      score += 10;
      factors.push({ label: "Poor H2H record", value: `${homeTeam.shortName} won only ${h2hHomeWins}/${h2hTotal} recent meetings`, impact: "negative" });
    } else {
      factors.push({ label: "Balanced H2H", value: `${h2hHomeWins}/${h2hTotal} meetings won by ${homeTeam.shortName}`, impact: "neutral" });
    }
  }

  // ── 5. Injuries ───────────────────────────────────────────────────
  if (injuredCount >= 3) {
    score += 20;
    factors.push({ label: "Significant injuries", value: `${injuredCount} players listed on injury report`, impact: "negative" });
  } else if (injuredCount >= 1) {
    score += 8;
    factors.push({ label: "Minor injury concerns", value: `${injuredCount} player(s) on injury report`, impact: "neutral" });
  } else {
    factors.push({ label: "Full squads available", value: "No injuries reported for either team", impact: "positive" });
  }

  // ── 6. Weather ────────────────────────────────────────────────────
  if (weather.condition === "Indoor") {
    factors.push({ label: "Indoor venue", value: "Weather has no impact", impact: "positive" });
  } else {
    const harsh = weather.windKph > 45 || ["Storm", "Snow", "Rain"].includes(weather.condition);
    const tricky = weather.windKph > 25 || weather.tempC < 3 || weather.tempC > 35;
    if (harsh) {
      score += 18;
      factors.push({ label: "Severe conditions", value: `${weather.condition}, ${weather.windKph}km/h wind, ${weather.tempC}°C`, impact: "negative" });
    } else if (tricky) {
      score += 8;
      factors.push({ label: "Tricky conditions", value: `${weather.condition}, ${weather.tempC}°C, ${weather.windKph}km/h wind`, impact: "neutral" });
    } else {
      factors.push({ label: "Ideal conditions", value: `${weather.condition}, ${weather.tempC}°C`, impact: "positive" });
    }
  }

  // ── Final score ───────────────────────────────────────────────────
  score = Math.max(10, Math.min(92, score));
  const level: RiskLevel = score <= 38 ? "Low" : score <= 63 ? "Medium" : "High";

  // ── Summary ───────────────────────────────────────────────────────
  const recStr =
    homeTeam.record.wins + homeTeam.record.losses > 0
      ? `${homeTeam.shortName} ${homeTeam.record.wins}-${homeTeam.record.losses} · ${awayTeam.shortName} ${awayTeam.record.wins}-${awayTeam.record.losses}.`
      : "";

  const summary = [
    `${level} risk based on live data.`,
    recStr,
    weather.condition === "Indoor" ? "" : `Weather: ${weather.condition}, ${weather.tempC}°C.`,
    injuredCount > 0 ? `${injuredCount} injury concern(s).` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { level, score: Math.round(score), factors, summary };
}
