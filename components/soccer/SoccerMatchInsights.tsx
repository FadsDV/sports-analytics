"use client";

import type { SofascoreTeamStats, SofascoreTopPlayer } from "@/lib/sports/sofascore";
import type { Team } from "@/lib/types";
import type { TeamHistoryGame } from "@/lib/sports/espn";
import type { TeamGameStat } from "@/lib/sports/soccer/espnSoccerData";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  homeTeam:           Team;
  awayTeam:           Team;
  homeTeamStats:      SofascoreTeamStats | null | undefined;
  awayTeamStats:      SofascoreTeamStats | null | undefined;
  topScorers:         SofascoreTopPlayer[];
  homeHistory:        TeamHistoryGame[];
  awayHistory:        TeamHistoryGame[];
  homeTeamGameStats?: TeamGameStat[];
  awayTeamGameStats?: TeamGameStat[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function perGame(value: number | null, matches: number): number | null {
  if (value == null || matches === 0) return null;
  return value / matches;
}

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return v.toFixed(decimals);
}

function pct(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v)}%`;
}

// Compute a 0-1 ratio for home side (0.5 = equal, >0.5 = home advantage)
function ratio(home: number | null, away: number | null): number {
  if (home == null || away == null) return 0.5;
  const total = home + away;
  if (total === 0) return 0.5;
  return home / total;
}

// Form computation from TeamHistoryGame[]
interface FormSummary {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  last5: ("W" | "D" | "L")[];
}

function computeForm(history: TeamHistoryGame[], venue: "home" | "away"): FormSummary {
  const filtered = history
    .filter(g => g.homeAway === venue && g.result != null)
    .slice(0, 5);

  const out: FormSummary = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, last5: [] };
  for (const g of filtered) {
    if (g.result === "W") { out.wins++; out.last5.push("W"); }
    else if (g.result === "D") { out.draws++; out.last5.push("D"); }
    else if (g.result === "L") { out.losses++; out.last5.push("L"); }

    if (g.score) {
      const parts = g.score.split("-").map(Number);
      if (parts.length === 2) {
        const [a, b] = parts;
        if (g.homeAway === "home") { out.goalsFor += a; out.goalsAgainst += b; }
        else { out.goalsFor += b; out.goalsAgainst += a; }
      }
    }
  }
  return out;
}

function resultDot(r: "W" | "D" | "L") {
  if (r === "W") return "bg-[#22C55E]";
  if (r === "D") return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
}

// ─── Pre-match aggregation ────────────────────────────────────────────────────

interface TeamVenueAgg {
  games:         number;
  goalsFor:      number;
  goalsAgainst:  number;
  btts:          number;
  over25:        number;
  cleanSheets:   number;
  corners:       number;
  cornersGames:  number;
  shots:         number;
  shotsGames:    number;
  shotsOnTarget: number;
  yellowCards:   number;
  cardsGames:    number;
}

function aggregateTeamStats(stats: TeamGameStat[], venue: "home" | "away"): TeamVenueAgg {
  const filtered = stats.filter(g => (venue === "home") === g.isHome);
  const out: TeamVenueAgg = {
    games: filtered.length,
    goalsFor: 0, goalsAgainst: 0, btts: 0, over25: 0, cleanSheets: 0,
    corners: 0, cornersGames: 0, shots: 0, shotsGames: 0, shotsOnTarget: 0,
    yellowCards: 0, cardsGames: 0,
  };

  for (const g of filtered) {
    out.goalsFor      += g.goalsFor;
    out.goalsAgainst  += g.goalsAgainst;
    if (g.goalsFor > 0 && g.goalsAgainst > 0) out.btts++;
    if (g.goalsFor + g.goalsAgainst > 2.5)     out.over25++;
    if (g.goalsAgainst === 0)                  out.cleanSheets++;
    if (g.corners != null) { out.corners += g.corners; out.cornersGames++; }
    if (g.shots != null)   { out.shots += g.shots; out.shotsGames++; out.shotsOnTarget += g.shotsOnTarget ?? 0; }
    if (g.yellowCards != null) { out.yellowCards += g.yellowCards; out.cardsGames++; }
  }

  return out;
}

function avgOrNull(total: number, count: number): number | null {
  return count > 0 ? total / count : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatBarRowProps {
  label:      string;
  homeValue:  number | null;
  awayValue:  number | null;
  format?:    (v: number | null) => string;
}

function StatBarRow({ label, homeValue, awayValue, format = (v) => fmt(v) }: StatBarRowProps) {
  const r = ratio(homeValue, awayValue);
  // clamp to 10%–90% so bars never fully disappear
  const homeWidth = Math.max(10, Math.min(90, Math.round(r * 100)));
  const awayWidth = 100 - homeWidth;

  return (
    <div className="py-2">
      {/* Values + label row */}
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-semibold text-text-1 w-10 text-left">{format(homeValue)}</span>
        <span className="text-text-2 text-xs tracking-wide uppercase">{label}</span>
        <span className="font-semibold text-text-1 w-10 text-right">{format(awayValue)}</span>
      </div>
      {/* Dual bar */}
      <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-primary rounded-l-full transition-all"
          style={{ width: `${homeWidth}%` }}
        />
        <div
          className="bg-[#60A5FA] rounded-r-full transition-all"
          style={{ width: `${awayWidth}%` }}
        />
      </div>
    </div>
  );
}

interface FormBlockProps {
  teamName: string;
  venue:    "home" | "away";
  form:     FormSummary;
}

function FormBlock({ teamName, venue, form }: FormBlockProps) {
  return (
    <div className="bg-surface2 rounded-xl p-4 flex-1 min-w-0">
      <div className="text-xs text-text-2 uppercase tracking-wider mb-1">
        {venue === "home" ? "Home" : "Away"} form
      </div>
      <div className="text-sm font-semibold text-text-1 mb-3 truncate">{teamName}</div>

      {/* Result dots */}
      <div className="flex gap-1.5 mb-3">
        {form.last5.length === 0
          ? <span className="text-xs text-text-2">No data</span>
          : form.last5.map((r, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${resultDot(r)}`}
              >
                {r}
              </div>
            ))
        }
      </div>

      {/* W/D/L counts */}
      <div className="flex gap-3 text-xs text-text-2">
        <span><span className="text-[#22C55E] font-semibold">{form.wins}W</span></span>
        <span><span className="text-[#F59E0B] font-semibold">{form.draws}D</span></span>
        <span><span className="text-[#EF4444] font-semibold">{form.losses}L</span></span>
      </div>

      {/* Goals */}
      {(form.goalsFor > 0 || form.goalsAgainst > 0) && (
        <div className="mt-2 text-xs text-text-2">
          <span className="text-text-1 font-medium">{form.goalsFor}</span> for ·{" "}
          <span className="text-text-1 font-medium">{form.goalsAgainst}</span> against
        </div>
      )}
    </div>
  );
}

// Build a SofascoreTeamStats-compatible object from raw game history
// Used for Team Comparison when no live/season stats are available (pre-match)
function syntheticTeamStats(stats: TeamGameStat[]): SofascoreTeamStats | null {
  if (stats.length === 0) return null;
  const n = stats.length;
  const sum  = (fn: (g: TeamGameStat) => number | null) =>
    stats.reduce((a, g) => a + (fn(g) ?? 0), 0);
  const hasAny = (fn: (g: TeamGameStat) => number | null) =>
    stats.some(g => fn(g) != null);
  const gamesWithStat = (fn: (g: TeamGameStat) => number | null) =>
    stats.filter(g => fn(g) != null).length;

  return {
    matches:                  n,
    goalsScored:              sum(g => g.goalsFor),
    goalsConceded:            sum(g => g.goalsAgainst),
    shots:                    hasAny(g => g.shots) ? sum(g => g.shots) : null,
    shotsOnTarget:            hasAny(g => g.shotsOnTarget) ? sum(g => g.shotsOnTarget) : null,
    corners:                  hasAny(g => g.corners) ? sum(g => g.corners) : null,
    fouls:                    hasAny(g => g.fouls) ? sum(g => g.fouls) : null,
    yellowCards:              hasAny(g => g.yellowCards) ? sum(g => g.yellowCards) : null,
    redCards:                 null,
    saves:                    null,
    // Possession: average of per-game values (not a sum)
    averageBallPossession:    hasAny(g => g.possession)
      ? sum(g => g.possession) / gamesWithStat(g => g.possession)
      : null,
    accuratePassesPercentage: null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SoccerMatchInsights({
  homeTeam,
  awayTeam,
  homeTeamStats,
  awayTeamStats,
  topScorers,
  homeHistory,
  awayHistory,
  homeTeamGameStats = [],
  awayTeamGameStats = [],
}: Props) {
  // Use real stats when available (live/finished); synthesize from history pre-match
  const effectiveHomeStats = homeTeamStats ?? syntheticTeamStats(homeTeamGameStats);
  const effectiveAwayStats = awayTeamStats ?? syntheticTeamStats(awayTeamGameStats);
  const isSynthetic = !homeTeamStats && !awayTeamStats && (effectiveHomeStats || effectiveAwayStats);

  const hm = effectiveHomeStats?.matches ?? 1;
  const am = effectiveAwayStats?.matches ?? 1;

  const homeForm = computeForm(homeHistory, "home");
  const awayForm = computeForm(awayHistory, "away");

  const hasStats     = effectiveHomeStats || effectiveAwayStats;
  const hasScorers   = topScorers.length > 0;
  const hasForm      = homeHistory.length > 0 || awayHistory.length > 0;
  const hasGameStats = homeTeamGameStats.length > 0 || awayTeamGameStats.length > 0;

  if (!hasStats && !hasScorers && !hasForm && !hasGameStats) return null;

  // Pre-match venue aggregations
  const homeAgg = aggregateTeamStats(homeTeamGameStats, "home");
  const awayAgg = aggregateTeamStats(awayTeamGameStats, "away");
  const homeVenueGames = homeAgg.games;
  const awayVenueGames = awayAgg.games;

  return (
    <div className="space-y-4">

      {/* ── Section 0: Pre-match Intelligence ── */}
      {hasGameStats && (homeVenueGames > 0 || awayVenueGames > 0) && (() => {
        const hGF  = avgOrNull(homeAgg.goalsFor,      homeVenueGames);
        const hGA  = avgOrNull(homeAgg.goalsAgainst,  homeVenueGames);
        const hBTTS = homeVenueGames > 0 ? homeAgg.btts / homeVenueGames * 100 : null;
        const hO25  = homeVenueGames > 0 ? homeAgg.over25 / homeVenueGames * 100 : null;
        const hCS   = homeVenueGames > 0 ? homeAgg.cleanSheets / homeVenueGames * 100 : null;
        const hCK   = avgOrNull(homeAgg.corners,     homeAgg.cornersGames);
        const hYC   = avgOrNull(homeAgg.yellowCards, homeAgg.cardsGames);
        const hSH   = avgOrNull(homeAgg.shots,       homeAgg.shotsGames);
        const hSOT  = avgOrNull(homeAgg.shotsOnTarget, homeAgg.shotsGames);

        const aGF  = avgOrNull(awayAgg.goalsFor,      awayVenueGames);
        const aGA  = avgOrNull(awayAgg.goalsAgainst,  awayVenueGames);
        const aBTTS = awayVenueGames > 0 ? awayAgg.btts / awayVenueGames * 100 : null;
        const aO25  = awayVenueGames > 0 ? awayAgg.over25 / awayVenueGames * 100 : null;
        const aCS   = awayVenueGames > 0 ? awayAgg.cleanSheets / awayVenueGames * 100 : null;
        const aCK   = avgOrNull(awayAgg.corners,     awayAgg.cornersGames);
        const aYC   = avgOrNull(awayAgg.yellowCards, awayAgg.cardsGames);
        const aSH   = avgOrNull(awayAgg.shots,       awayAgg.shotsGames);
        const aSOT  = avgOrNull(awayAgg.shotsOnTarget, awayAgg.shotsGames);

        const rows: { label: string; hVal: number | null; aVal: number | null; fmt: (v: number | null) => string; higherIsBetter?: boolean }[] = [
          { label: "Goals Scored",    hVal: hGF,   aVal: aGF,   fmt: v => fmt(v) },
          { label: "Goals Conceded",  hVal: hGA,   aVal: aGA,   fmt: v => fmt(v), higherIsBetter: false },
          { label: "BTTS %",          hVal: hBTTS, aVal: aBTTS, fmt: v => pct(v) },
          { label: "Over 2.5 %",      hVal: hO25,  aVal: aO25,  fmt: v => pct(v) },
          { label: "Clean Sheet %",   hVal: hCS,   aVal: aCS,   fmt: v => pct(v) },
          ...(hCK != null || aCK != null ? [{ label: "Corners", hVal: hCK, aVal: aCK, fmt: (v: number | null) => fmt(v) }] : []),
          ...(hYC != null || aYC != null ? [{ label: "Yellow Cards", hVal: hYC, aVal: aYC, fmt: (v: number | null) => fmt(v), higherIsBetter: false as boolean | undefined }] : []),
          ...(hSH != null || aSH != null ? [{ label: "Shots", hVal: hSH, aVal: aSH, fmt: (v: number | null) => fmt(v) }] : []),
          ...(hSOT != null || aSOT != null ? [{ label: "Shots on Target", hVal: hSOT, aVal: aSOT, fmt: (v: number | null) => fmt(v) }] : []),
        ];

        return (
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-text-1 mb-1">Pre-match Intelligence</h3>
            <p className="text-xs text-text-2 mb-4">
              {homeTeam.shortName} last {homeVenueGames} home · {awayTeam.shortName} last {awayVenueGames} away
            </p>

            {/* Column headers */}
            <div className="flex justify-between text-xs mb-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                <span className="text-text-2 font-medium truncate max-w-[100px]">
                  {homeTeam.shortName} <span className="text-text-2 opacity-60">(home)</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]" />
                <span className="text-text-2 font-medium truncate max-w-[100px]">
                  {awayTeam.shortName} <span className="text-text-2 opacity-60">(away)</span>
                </span>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {rows.map(r => (
                <StatBarRow
                  key={r.label}
                  label={r.label}
                  homeValue={r.hVal}
                  awayValue={r.aVal}
                  format={r.fmt}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Section 1: Team Comparison ── */}
      {hasStats && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-1 mb-1">Team Comparison</h3>
          <p className="text-xs text-text-2 mb-4">
            {isSynthetic
              ? `Last ${Math.max(hm, am)} game averages (all venues)`
              : "Season averages per game"}
          </p>

          {/* Legend */}
          <div className="flex justify-between text-xs mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-text-2 font-medium truncate max-w-[100px]">{homeTeam.shortName}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#60A5FA]" />
              <span className="text-text-2 font-medium truncate max-w-[100px]">{awayTeam.shortName}</span>
            </div>
          </div>

          <div className="divide-y divide-border/50">
            <StatBarRow
              label="Goals Scored"
              homeValue={perGame(effectiveHomeStats?.goalsScored ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.goalsScored ?? null, am)}
            />
            <StatBarRow
              label="Goals Conceded"
              homeValue={perGame(effectiveHomeStats?.goalsConceded ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.goalsConceded ?? null, am)}
            />
            <StatBarRow
              label="Shots"
              homeValue={perGame(effectiveHomeStats?.shots ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.shots ?? null, am)}
            />
            <StatBarRow
              label="Shots on Target"
              homeValue={perGame(effectiveHomeStats?.shotsOnTarget ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.shotsOnTarget ?? null, am)}
            />
            <StatBarRow
              label="Corners"
              homeValue={perGame(effectiveHomeStats?.corners ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.corners ?? null, am)}
            />
            <StatBarRow
              label="Fouls"
              homeValue={perGame(effectiveHomeStats?.fouls ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.fouls ?? null, am)}
            />
            <StatBarRow
              label="Yellow Cards"
              homeValue={perGame(effectiveHomeStats?.yellowCards ?? null, hm)}
              awayValue={perGame(effectiveAwayStats?.yellowCards ?? null, am)}
            />
            <StatBarRow
              label="Possession"
              homeValue={effectiveHomeStats?.averageBallPossession ?? null}
              awayValue={effectiveAwayStats?.averageBallPossession ?? null}
              format={pct}
            />
            <StatBarRow
              label="Pass Accuracy"
              homeValue={effectiveHomeStats?.accuratePassesPercentage ?? null}
              awayValue={effectiveAwayStats?.accuratePassesPercentage ?? null}
              format={pct}
            />
          </div>
        </div>
      )}

      {/* ── Section 2: Home & Away Form ── */}
      {hasForm && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-1 mb-4">Venue Form</h3>
          <div className="flex gap-3">
            <FormBlock teamName={homeTeam.name} venue="home" form={homeForm} />
            <FormBlock teamName={awayTeam.name} venue="away" form={awayForm} />
          </div>
        </div>
      )}

      {/* ── Section 3: Top Scorers ── */}
      {hasScorers && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-1 mb-4">Top Scorers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-2 uppercase tracking-wider border-b border-border/50">
                  <th className="text-left pb-2 pr-3 font-medium w-6">#</th>
                  <th className="text-left pb-2 pr-3 font-medium">Player</th>
                  <th className="text-left pb-2 pr-3 font-medium hidden sm:table-cell">Team</th>
                  <th className="text-right pb-2 pr-3 font-medium">G</th>
                  <th className="text-right pb-2 pr-3 font-medium">A</th>
                  <th className="text-right pb-2 font-medium hidden sm:table-cell">SOT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {topScorers.map((p, i) => (
                  <tr key={p.playerId} className="hover:bg-surface2/50 transition-colors">
                    <td className="py-2 pr-3 text-text-2 text-xs">{i + 1}</td>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-text-1">{p.shortName}</span>
                    </td>
                    <td className="py-2 pr-3 text-text-2 text-xs hidden sm:table-cell">{p.teamName}</td>
                    <td className="py-2 pr-3 text-right">
                      <span className="font-bold text-primary">{p.goals}</span>
                    </td>
                    <td className="py-2 pr-3 text-right text-text-2">{p.assists}</td>
                    <td className="py-2 text-right text-text-2 hidden sm:table-cell">
                      {p.shotsOnTarget ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
