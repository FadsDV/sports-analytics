/**
 * /analytics — Slip performance dashboard
 *
 * Reads from data/local/slips.db (never pushed to git).
 * Shows: overall stats, per-slip-type hit rates, model calibration,
 * player accuracy, and recent game outcomes.
 */

import type { Metadata } from "next";
import {
  getOverallStats,
  getSlipHitStats,
  getReliabilityCalibration,
  getPlayerStatHitRate,
  getRecentGames,
} from "@/lib/local/slipDb";
import ResetButton from "./ResetButton";

export const metadata: Metadata = { title: "Slip Analytics · DegenHUB" };
export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n * 100)}%`;
}

function hitColor(rate: number | null): string {
  if (rate === null) return "text-text-2";
  if (rate >= 0.70) return "text-[#22C55E]";
  if (rate >= 0.50) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

function driftColor(drift: number | null): string {
  if (drift === null) return "text-text-2";
  if (drift >= -0.05) return "text-[#22C55E]";   // model accurate or underestimating
  if (drift >= -0.15) return "text-[#F59E0B]";   // slightly overconfident
  return "text-[#EF4444]";                         // badly overconfident
}

const SLIP_LABELS: Record<string, { emoji: string; label: string }> = {
  safe:        { emoji: "🛡️", label: "Safe"         },
  doable:      { emoji: "✅", label: "Doable"       },
  goalscorers: { emoji: "🎯", label: "Goal Scorers" },
  disposals:   { emoji: "📋", label: "Disposals"    },
  ballsy:      { emoji: "🔥", label: "Ballsy"       },
  value:       { emoji: "💰", label: "Value Picks"  },
};

const STAT_LABELS: Record<string, string> = {
  D: "Disposals", G: "Goals", M: "Marks", T: "Tackles", HO: "Hitouts", K: "Kicks", H: "Handballs",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
  } catch { return iso.slice(0, 10); }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface rounded-xl p-4 border border-border">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-text-2 mb-1">{label}</div>
      <div className="text-2xl font-black text-text-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-text-2 mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold text-text-1">{title}</h2>
      {sub && <p className="text-[11px] text-text-2 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-surface rounded-xl p-8 border border-border text-center">
      <p className="text-sm text-text-2">{message}</p>
      <p className="text-[11px] text-text-2 mt-1 opacity-60">Open some AFL game Kitchen tabs to start collecting data.</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const overall     = getOverallStats();
  const slipStats   = getSlipHitStats();
  const calibration = getReliabilityCalibration();
  const playerStats = getPlayerStatHitRate();
  const recentGames = getRecentGames(15);

  const hasData = overall.totalGames > 0;
  const coverage = overall.totalLegs > 0
    ? Math.round((overall.resolvedLegs / overall.totalLegs) * 100)
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black text-text-1">Slip Analytics</h1>
          <p className="text-[11px] text-text-2 mt-0.5">Local data only — never synced. Tracks every AFL kitchen generated on this machine.</p>
        </div>
        <ResetButton />
      </div>

      {/* ── Overview chips ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip label="Games Logged"   value={String(overall.totalGames)}    sub={`${overall.resolvedGames} resolved`} />
        <StatChip label="Slips Generated" value={String(overall.totalSlips)}   sub={`${overall.totalLegs} total legs`} />
        <StatChip label="Leg Hit Rate"    value={pct(overall.legHitRate)}      sub={`${overall.resolvedLegs} legs resolved`} />
        <StatChip label="Full Slip Rate"  value={pct(overall.slipHitRate)}     sub={`${coverage}% legs resolved`} />
      </div>

      {!hasData && (
        <EmptyState message="No slips logged yet." />
      )}

      {hasData && (
        <>
          {/* ── Slip type performance ───────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Performance by Slip Type"
              sub="Full hit = every leg in the slip cleared its threshold. Target: ≥70% full hit rate."
            />
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Slip</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Generated</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Resolved</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Full Hit 🤝</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Partial</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Bust</th>
                    <th className="text-right px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Hit Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {slipStats.map((s, i) => {
                    const meta = SLIP_LABELS[s.slipType] ?? { emoji: "●", label: s.slipType };
                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2 transition-colors">
                        <td className="px-4 py-3">
                          <span className="mr-1.5">{meta.emoji}</span>
                          <span className="font-medium text-text-1">{meta.label}</span>
                          {s.bookie !== "generic" && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-surface2 text-text-2">{s.bookie}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-text-2 tabular-nums">{s.totalSlips}</td>
                        <td className="px-3 py-3 text-right text-text-2 tabular-nums">{s.resolvedSlips}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-[#22C55E]">{s.fullHits}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#F59E0B]">{s.partialHits}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-[#EF4444]">{s.busts}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-black tabular-nums ${hitColor(s.hitRate)}`}>
                            {pct(s.hitRate)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Model calibration ───────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Model Calibration"
              sub="Is the reliability engine accurate? Actual hit rate should be close to the predicted band. Red = model is overconfident."
            />
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Confidence Band</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Model Predicts</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Legs</th>
                    <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Actual Hit %</th>
                    <th className="text-right px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {calibration.map((b, i) => {
                    const delta = b.actualHitRate !== null ? b.actualHitRate - b.predictedMid : null;
                    return (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2 transition-colors">
                        <td className="px-4 py-3 font-medium text-text-1">{b.band}</td>
                        <td className="px-3 py-3 text-right text-text-2 tabular-nums">{pct(b.predictedMid)}</td>
                        <td className="px-3 py-3 text-right text-text-2 tabular-nums">
                          {b.legs > 0 ? b.legs : <span className="opacity-40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className={`font-bold tabular-nums ${hitColor(b.actualHitRate)}`}>
                            {pct(b.actualHitRate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {delta !== null ? (
                            <span className={`text-xs font-bold tabular-nums ${delta >= 0 ? "text-[#22C55E]" : delta >= -0.10 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>
                              {delta >= 0 ? "+" : ""}{Math.round(delta * 100)}pp
                            </span>
                          ) : <span className="text-text-2 opacity-40">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2.5 border-t border-border bg-surface2/30">
                <p className="text-[10px] text-text-2">
                  <span className="text-[#22C55E] font-bold">+pp</span> = model underestimating (conservative) ·{" "}
                  <span className="text-[#EF4444] font-bold">−pp</span> = model overconfident (thresholds too aggressive) · pp = percentage points
                </p>
              </div>
            </div>
          </div>

          {/* ── Player accuracy ──────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Player Accuracy"
              sub="Sorted by model error (worst first). Large negative drift = model is too bullish on this player/stat combo. Min 2 resolved legs."
            />
            {playerStats.length === 0 ? (
              <EmptyState message="Not enough resolved legs yet. Need at least 2 per player/stat combination." />
            ) : (
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Player</th>
                      <th className="text-left px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Stat</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Legs</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Actual Hit %</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Model Said</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Avg Line</th>
                      <th className="text-right px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Avg Actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((p, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-text-1 truncate max-w-[140px]">{p.player}</td>
                        <td className="px-3 py-2.5 text-text-2">{STAT_LABELS[p.stat] ?? p.stat}</td>
                        <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">{p.legs}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-bold tabular-nums ${hitColor(p.hitRate)}`}>{pct(p.hitRate)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">{pct(p.avgReliability)}</td>
                        <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">{p.avgThreshold}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={p.avgActual >= p.avgThreshold ? "text-[#22C55E] tabular-nums font-medium" : "text-[#EF4444] tabular-nums font-medium"}>
                            {p.avgActual}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Recent games ─────────────────────────────────────────────────── */}
          <div>
            <SectionHeader
              title="Recent Games"
              sub="Last 15 logged games. Open a finished game to trigger outcome resolution."
            />
            {recentGames.length === 0 ? (
              <EmptyState message="No games logged yet." />
            ) : (
              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Game</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Date</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Slips</th>
                      <th className="text-right px-3 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Full Hits</th>
                      <th className="text-right px-4 py-2.5 text-text-2 font-semibold uppercase tracking-wider text-[10px]">Legs Hit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentGames.map((g, i) => {
                      const legRate = g.totalLegs > 0 ? g.hitLegs / g.totalLegs : null;
                      const resolved = g.resolvedSlips > 0;
                      return (
                        <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-text-1">{g.homeTeam.split(" ").pop()}</span>
                            <span className="text-text-2 mx-1.5">vs</span>
                            <span className="font-medium text-text-1">{g.awayTeam.split(" ").pop()}</span>
                            {g.venue && <span className="ml-2 text-[10px] text-text-2 opacity-60">{g.venue}</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">
                            {fmtDate(g.gameDate)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-text-2 tabular-nums">
                            {g.totalSlips}
                            {!resolved && g.totalSlips > 0 && (
                              <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-surface2 text-text-2 opacity-60">pending</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {resolved ? (
                              <span className={`font-bold ${g.fullHits > 0 ? "text-[#22C55E]" : "text-text-2"}`}>
                                {g.fullHits}/{g.resolvedSlips}
                              </span>
                            ) : <span className="text-text-2 opacity-40">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {resolved ? (
                              <span className={`font-bold tabular-nums ${hitColor(legRate)}`}>
                                {g.hitLegs}/{g.totalLegs}
                              </span>
                            ) : <span className="text-text-2 opacity-40">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer note */}
      <div className="text-[10px] text-text-2 opacity-50 pb-4">
        Data stored locally at <code>data/local/slips.db</code> · Never synced to git or any server
      </div>
    </div>
  );
}
