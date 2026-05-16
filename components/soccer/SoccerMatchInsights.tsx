"use client";

import type { SofascoreTeamStats, SofascoreTopPlayer } from "@/lib/sports/sofascore";
import type { Team } from "@/lib/types";
import type { TeamHistoryGame } from "@/lib/sports/espn";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  homeTeam:      Team;
  awayTeam:      Team;
  homeTeamStats: SofascoreTeamStats | null | undefined;
  awayTeamStats: SofascoreTeamStats | null | undefined;
  topScorers:    SofascoreTopPlayer[];
  homeHistory:   TeamHistoryGame[];
  awayHistory:   TeamHistoryGame[];
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function SoccerMatchInsights({
  homeTeam,
  awayTeam,
  homeTeamStats,
  awayTeamStats,
  topScorers,
  homeHistory,
  awayHistory,
}: Props) {
  const hm = homeTeamStats?.matches ?? 1;
  const am = awayTeamStats?.matches ?? 1;

  const homeForm = computeForm(homeHistory, "home");
  const awayForm = computeForm(awayHistory, "away");

  const hasStats = homeTeamStats || awayTeamStats;
  const hasScorers = topScorers.length > 0;
  const hasForm = homeHistory.length > 0 || awayHistory.length > 0;

  if (!hasStats && !hasScorers && !hasForm) return null;

  return (
    <div className="space-y-4">

      {/* ── Section 1: Team Comparison ── */}
      {hasStats && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-text-1 mb-1">Team Comparison</h3>
          <p className="text-xs text-text-2 mb-4">Season averages per game</p>

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
              homeValue={perGame(homeTeamStats?.goalsScored ?? null, hm)}
              awayValue={perGame(awayTeamStats?.goalsScored ?? null, am)}
            />
            <StatBarRow
              label="Goals Conceded"
              homeValue={perGame(homeTeamStats?.goalsConceded ?? null, hm)}
              awayValue={perGame(awayTeamStats?.goalsConceded ?? null, am)}
            />
            <StatBarRow
              label="Shots"
              homeValue={perGame(homeTeamStats?.shots ?? null, hm)}
              awayValue={perGame(awayTeamStats?.shots ?? null, am)}
            />
            <StatBarRow
              label="Shots on Target"
              homeValue={perGame(homeTeamStats?.shotsOnTarget ?? null, hm)}
              awayValue={perGame(awayTeamStats?.shotsOnTarget ?? null, am)}
            />
            <StatBarRow
              label="Corners"
              homeValue={perGame(homeTeamStats?.corners ?? null, hm)}
              awayValue={perGame(awayTeamStats?.corners ?? null, am)}
            />
            <StatBarRow
              label="Fouls"
              homeValue={perGame(homeTeamStats?.fouls ?? null, hm)}
              awayValue={perGame(awayTeamStats?.fouls ?? null, am)}
            />
            <StatBarRow
              label="Yellow Cards"
              homeValue={perGame(homeTeamStats?.yellowCards ?? null, hm)}
              awayValue={perGame(awayTeamStats?.yellowCards ?? null, am)}
            />
            <StatBarRow
              label="Possession"
              homeValue={homeTeamStats?.averageBallPossession ?? null}
              awayValue={awayTeamStats?.averageBallPossession ?? null}
              format={pct}
            />
            <StatBarRow
              label="Pass Accuracy"
              homeValue={homeTeamStats?.accuratePassesPercentage ?? null}
              awayValue={awayTeamStats?.accuratePassesPercentage ?? null}
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
