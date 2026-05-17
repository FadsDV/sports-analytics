/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SofascorePlayer, SofascorePlayerSeasonStats, SofascoreGameLog } from "@/lib/sports/sofascore";
import type { SoccerPlayerAnalyticsResult } from "@/lib/sports/soccer/types";
import { computeReliability as computeRelNew, SOCCER_CONFIG } from "@/lib/sports/reliability/engine";
import { getConfidenceTier, CONFIDENCE_LABEL, CONFIDENCE_COLORS } from "@/lib/sports/reliability/labels";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingColor(r: number) {
  if (r >= 8.0) return "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/40";
  if (r >= 7.5) return "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30";
  if (r >= 6.5) return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30";
  return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30";
}

function posColor(pos: string) {
  const p = pos.toUpperCase()[0];
  if (p === "G") return "text-[#F59E0B] bg-[#F59E0B]/10";
  if (p === "D") return "text-[#60A5FA] bg-[#60A5FA]/10";
  if (p === "M") return "text-[#22C55E] bg-[#22C55E]/10";
  if (p === "F" || p === "A") return "text-[#EF4444] bg-[#EF4444]/10";
  return "text-text-2 bg-surface2";
}

function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null) return "—";
  return dec > 0 ? v.toFixed(dec) : String(Math.round(v));
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-text-2">{label}</span>
      <span className={`text-[11px] font-bold tabular-nums ${highlight ? "text-primary" : "text-text-1"}`}>{value}</span>
    </div>
  );
}

function SeasonStatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? "bg-primary/10 border border-primary/20" : "bg-surface2"}`}>
      <div className={`text-sm font-black tabular-nums leading-none ${highlight ? "text-primary" : "text-text-1"}`}>{value}</div>
      <div className="text-[9px] text-text-2 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function PlayerPhoto({ id, name, size = 72 }: { id: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (failed) {
    return (
      <div
        className="rounded-full bg-surface2 border-2 border-border flex items-center justify-center text-text-1 font-black shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >{initials}</div>
    );
  }
  return (
    <img
      src={`https://img.sofascore.com/api/v1/player/${id}/image`}
      alt={name} width={size} height={size}
      onError={() => setFailed(true)}
      className="rounded-full object-cover bg-surface2 border-2 border-border/40 shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Recent game row ──────────────────────────────────────────────────────────

function shortTeamName(full: string) {
  return full.split(" ").slice(-1)[0] ?? full;
}

function StatPill({ label, value, hi }: { label: string; value: number | null; hi?: boolean }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col items-center min-w-[28px]">
      <span className={`text-[11px] font-bold tabular-nums leading-none ${hi ? "text-primary" : "text-text-1"}`}>{value}</span>
      <span className="text-[8px] text-text-2 uppercase tracking-wide mt-0.5">{label}</span>
    </div>
  );
}

function GameLogRow({ game }: { game: SofascoreGameLog }) {
  const dateStr = game.date.slice(5).replace("-", "/"); // MM/DD
  // Determine result from player's team perspective using playerTeamId
  const playerIsHome = game.playerTeamId != null && game.playerTeamId === game.homeTeamId;
  const teamScore = playerIsHome ? game.homeScore : game.awayScore;
  const oppScore  = playerIsHome ? game.awayScore : game.homeScore;
  const isW = teamScore > oppScore;
  const isL = teamScore < oppScore;
  const res = isW ? "W" : isL ? "L" : "D";
  const resCls = isW ? "bg-[#22C55E]/20 text-[#22C55E]" : isL ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]";

  return (
    <div className="py-2.5 border-b border-border/30 last:border-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-text-2 tabular-nums w-10 shrink-0">{dateStr}</span>
          <span className={`w-4 h-4 rounded-[2px] text-[8px] font-bold flex items-center justify-center shrink-0 ${resCls}`}>{res}</span>
          <span className="text-[11px] text-text-1 font-medium">
            {shortTeamName(game.homeTeam || "")} {game.homeScore}–{game.awayScore} {shortTeamName(game.awayTeam || "")}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {game.minutesPlayed != null && (
            <span className="text-[9px] text-text-2">{game.minutesPlayed}&apos;</span>
          )}
          {game.rating != null && (
            <span className={`text-[10px] px-1.5 py-px rounded font-black border tabular-nums ${ratingColor(game.rating)}`}>
              {game.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-start gap-3 pl-12 flex-wrap">
        <StatPill label="G"   value={game.goals}         hi={(game.goals ?? 0) > 0} />
        <StatPill label="A"   value={game.assists}       hi={(game.assists ?? 0) > 0} />
        <StatPill label="xG"  value={game.xG != null ? parseFloat(game.xG.toFixed(2)) : null} hi={(game.xG ?? 0) >= 0.3} />
        <StatPill label="SOT" value={game.shotsOnTarget} hi={(game.shotsOnTarget ?? 0) >= 2} />
        <StatPill label="KP"  value={game.keyPasses}     hi={(game.keyPasses ?? 0) >= 2} />
        <StatPill label="TKL" value={game.tackles} />
        <StatPill label="INT" value={game.interceptions} hi={(game.interceptions ?? 0) >= 2} />
      </div>
    </div>
  );
}

// ─── Bet Checker ──────────────────────────────────────────────────────────────

interface CheckerCardDef {
  label:     string;
  vals:      number[];
  threshold: number;
  avg:       number;
  avgLabel:  string;
}

function CheckerCard({ def }: { def: CheckerCardDef }) {
  const hitRate  = def.vals.length ? def.vals.filter(v => v >= def.threshold).length / def.vals.length : 0;
  const breakdown = computeRelNew({ vals: def.vals, threshold: def.threshold, config: SOCCER_CONFIG });
  const tier = getConfidenceTier(breakdown.finalReliability);
  const c    = CONFIDENCE_COLORS[tier];
  return (
    <div className={`rounded-xl p-3 border ${c.border} ${c.bg}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[#6B7280] font-medium leading-tight">{def.label}</span>
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${c.bg} ${c.text} shrink-0 ml-1`}>
          {CONFIDENCE_LABEL[tier]}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-black tabular-nums ${c.text}`}>
          {def.vals.length ? `${Math.round(hitRate * 100)}%` : "—"}
        </span>
        <span className="text-[10px] text-[#6B7280]">hit rate</span>
      </div>
      <div className="h-[3px] bg-white/5 rounded-full overflow-hidden mt-2 mb-1.5">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.round(breakdown.finalReliability * 100)}%` }} />
      </div>
      <div className="text-[9px] text-[#4B5563]">{def.avgLabel}</div>
    </div>
  );
}

function BetChecker({
  recentGames,
  seasonStats,
  position,
}: {
  recentGames:  SofascoreGameLog[];
  seasonStats:  SofascorePlayerSeasonStats;
  position?:    string;
}) {
  if (!recentGames.length || !seasonStats) return null;

  const apps = seasonStats.appearances || 1;
  const pos  = (position ?? "F").toUpperCase()[0]; // G D M F A

  // ── Per-game vals from recent games ────────────────────────────────────────
  const goalVals    = recentGames.map(g => g.goals         ?? 0);
  const sotVals     = recentGames.map(g => g.shotsOnTarget ?? 0);
  const shotVals    = recentGames.map(g => g.shots         ?? 0);
  const soaVals     = recentGames.map(g => (g.goals ?? 0) + (g.assists ?? 0));
  const tackleVals  = recentGames.map(g => g.tackles       ?? 0);
  const saveVals    = recentGames.map(g => g.saves         ?? 0);

  // ── Season averages ────────────────────────────────────────────────────────
  const goalAvg   = (seasonStats.goals         ?? 0) / apps;
  const sotAvg    = (seasonStats.shotsOnTarget  ?? 0) / apps;
  const shotAvg   = (seasonStats.totalShots     ?? 0) / apps;
  const soaAvg    = ((seasonStats.goals ?? 0) + (seasonStats.assists ?? 0)) / apps;
  const xGAvg     = (seasonStats.expectedGoals  ?? 0) / apps;
  const tackleAvg = (seasonStats.tackles        ?? 0) / apps;
  const saveAvg   = recentGames.length
    ? saveVals.reduce((a, b) => a + b, 0) / recentGames.length
    : 0;

  // ── Shot profile (accuracy + quality, for outfield players) ───────────────
  const recentShotAvg = shotVals.length ? shotVals.reduce((a, b) => a + b, 0) / shotVals.length : 0;
  const recentSotAvg  = sotVals.length  ? sotVals.reduce((a, b)  => a + b, 0) / sotVals.length  : 0;
  const sotPct = recentShotAvg > 0 ? Math.round((recentSotAvg / recentShotAvg) * 100) : null;

  // ── Position-adaptive card definitions ─────────────────────────────────────
  let cards: CheckerCardDef[];

  if (pos === "G") {
    // GK: Saves (two thresholds)
    const saveThr = saveAvg >= 3.5 ? 3.5 : saveAvg >= 2.0 ? 2.5 : 1.5;
    cards = [
      { label: `Saves ≥${saveThr}`, vals: saveVals, threshold: saveThr,
        avg: saveAvg, avgLabel: `avg ${saveAvg.toFixed(1)} saves/game` },
      { label: "Saves ≥1.5", vals: saveVals, threshold: 1.5,
        avg: saveAvg, avgLabel: `last ${recentGames.length} games` },
    ];
  } else if (pos === "D") {
    // Defender: Goals, SOT, Tackles
    const sotThr = sotAvg >= 0.6 ? 0.5 : null;
    const tklThr = tackleAvg >= 3 ? 2.5 : tackleAvg >= 1.5 ? 1.5 : 0.5;
    cards = [
      { label: "Goal Scorer (0.5+)", vals: goalVals, threshold: 0.5,
        avg: goalAvg, avgLabel: `avg ${goalAvg.toFixed(2)} goals/game` },
      ...(sotThr !== null ? [{
        label: "Shots on Target (0.5+)", vals: sotVals, threshold: sotThr,
        avg: sotAvg, avgLabel: `avg ${sotAvg.toFixed(1)} SOT/game`,
      }] : []),
      { label: `Tackles ≥${tklThr}`, vals: tackleVals, threshold: tklThr,
        avg: tackleAvg, avgLabel: `avg ${tackleAvg.toFixed(1)} tackles/game` },
    ];
  } else if (pos === "M") {
    // Midfielder: Score/Assist, SOT, Goals
    const sotThr = sotAvg >= 1.2 ? 1.5 : 0.5;
    cards = [
      { label: "Score or Assist (0.5+)", vals: soaVals, threshold: 0.5,
        avg: soaAvg, avgLabel: `avg ${soaAvg.toFixed(2)} G+A/game` },
      { label: `Shots on Target ≥${sotThr}`, vals: sotVals, threshold: sotThr,
        avg: sotAvg, avgLabel: `avg ${sotAvg.toFixed(1)} SOT/game` },
      { label: "Goal Scorer (0.5+)", vals: goalVals, threshold: 0.5,
        avg: goalAvg, avgLabel: `avg ${goalAvg.toFixed(2)} goals/game` },
    ];
  } else {
    // Forward (F/A) + default: Goals, SOT, Score/Assist
    const sotThr = sotAvg >= 1.2 ? 1.5 : 0.5;
    cards = [
      { label: "Goal Scorer (0.5+)", vals: goalVals, threshold: 0.5,
        avg: goalAvg, avgLabel: `avg ${goalAvg.toFixed(2)} goals/game` },
      { label: `Shots on Target ≥${sotThr}`, vals: sotVals, threshold: sotThr,
        avg: sotAvg, avgLabel: `avg ${sotAvg.toFixed(1)} SOT/game` },
      { label: "Score or Assist (0.5+)", vals: soaVals, threshold: 0.5,
        avg: soaAvg, avgLabel: `avg ${soaAvg.toFixed(2)} G+A/game` },
    ];
  }

  return (
    <div className="px-6 py-4 border-b border-white/5 bg-[#0d1421]">
      <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#374151] mb-3">
        Bet Checker · Last {recentGames.length} Games
      </div>

      <div className={`grid gap-3 ${cards.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {cards.map((def, i) => <CheckerCard key={i} def={def} />)}
      </div>

      {/* Shot profile — outfield players only */}
      {pos !== "G" && (recentShotAvg > 0 || xGAvg > 0) && (
        <div className="mt-3 flex items-center gap-4 px-1">
          <div className="text-[9px] font-bold text-[#374151] uppercase tracking-widest shrink-0">Shot Profile</div>
          <div className="flex items-center gap-3 flex-wrap">
            {recentShotAvg > 0 && (
              <span className="text-[10px] text-[#6B7280]">
                <span className="text-white font-bold tabular-nums">{recentShotAvg.toFixed(1)}</span> shots/g
              </span>
            )}
            {recentSotAvg > 0 && (
              <span className="text-[10px] text-[#6B7280]">
                <span className="text-white font-bold tabular-nums">{recentSotAvg.toFixed(1)}</span> SOT/g
              </span>
            )}
            {sotPct !== null && (
              <span className="text-[10px] text-[#6B7280]">
                <span className={`font-bold tabular-nums ${sotPct >= 40 ? "text-[#22C55E]" : sotPct >= 25 ? "text-[#F59E0B]" : "text-[#EF4444]"}`}>
                  {sotPct}%
                </span> on target
              </span>
            )}
            {xGAvg > 0.02 && (
              <span className="text-[10px] text-[#6B7280]">
                xG <span className={`font-bold tabular-nums ${xGAvg >= 0.25 ? "text-[#22C55E]" : xGAvg >= 0.10 ? "text-[#F59E0B]" : "text-[#6B7280]"}`}>
                  {xGAvg.toFixed(2)}
                </span>/g
              </span>
            )}
            {shotAvg > 0 && xGAvg > 0.02 && (
              <span className="text-[10px] text-[#6B7280]">
                xG/shot <span className="font-bold tabular-nums text-[#6B7280]">
                  {(xGAvg / Math.max(shotAvg, 0.1)).toFixed(2)}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SoccerPlayerDrawerProps {
  data?:           SoccerPlayerAnalyticsResult | null;
  player?:         SofascorePlayer;
  teamName?:       string;
  tournamentId?:   number;
  opponentTeamId?: number;
  onClose:         () => void;
}

export default function SoccerPlayerDrawer({ data: preData, player: prePlayer, teamName: preTeamName, tournamentId, opponentTeamId, onClose }: SoccerPlayerDrawerProps) {
  const [visible, setVisible]   = useState(false);
  const [loading, setLoading]   = useState(!preData);
  const [data, setData]         = useState<any>(preData || null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (preData) return;
    if (!prePlayer?.id) { setLoading(false); return; }
    const params = new URLSearchParams();
    if (tournamentId)   params.set("tournamentId",   String(tournamentId));
    if (opponentTeamId) params.set("opponentTeamId", String(opponentTeamId));
    fetch(`/api/soccer/player/${prePlayer.id}?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [preData, prePlayer?.id, tournamentId, opponentTeamId]);

  const player = preData ? {
    id: preData.playerId,
    name: preData.playerName,
    shortName: preData.shortName,
    position: preData.position,
    jerseyNumber: preData.jersey,
    rating: preData.seasonStats?.rating,
  } : prePlayer;

  const teamName = preData ? preData.teamName : preTeamName;

  if (!player) return null;

  const ss = data?.seasonStats;
  const recentGames = data?.recentGames || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" style={{ opacity: visible ? 1 : 0 }} />
      <div
        className="fixed top-0 right-0 h-full w-full max-w-2xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 z-[70] overflow-y-auto transition-transform duration-300 flex flex-col"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="bg-[#111827] border-b border-[#3B82F6]/20 px-6 py-5 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-5">
            <div className="relative group shrink-0">
              <PlayerPhoto id={player.id} name={player.name} size={64} />
              <div className="absolute -bottom-1 -right-1 bg-[#3B82F6] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-[#0B0F1A]">
                #{player.jerseyNumber || "—"}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-white tracking-tight truncate uppercase mb-1">{player.name}</h2>
              <div className="flex items-center gap-3">
                <span className={`text-[11px] font-bold text-[#3B82F6] uppercase tracking-widest`}>{player.position}</span>
                <span className="w-1 h-1 rounded-full bg-[#374151]" />
                <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-widest">{teamName}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-[#6B7280] hover:text-white transition-all rounded-lg border border-white/5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {ss && recentGames.length > 0 && (
          <BetChecker recentGames={recentGames} seasonStats={ss} position={player.position} />
        )}

        <div className="p-6 space-y-8 flex-1">
          {loading && <div className="text-center py-20 text-text-2">Loading stats...</div>}

          {ss && (
            <div className="space-y-6">
              <section className="grid grid-cols-4 gap-4">
                <div className="col-span-1 bg-[#3B82F6]/5 border border-[#3B82F6]/10 rounded-xl p-4 flex flex-col items-center justify-center">
                  <span className="text-[9px] font-bold text-[#3B82F6] uppercase tracking-widest mb-1">Apps</span>
                  <span className="text-xl font-black text-white tabular-nums">{ss.appearances || 0}</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl px-4 py-3 flex flex-col items-center min-w-[72px]">
                  <span className="text-[9px] text-[#6B7280] uppercase tracking-wider font-semibold mb-0.5">Avg Goals</span>
                  <span className="text-base font-black text-white tabular-nums">{fmt((ss.goals || 0) / (ss.appearances || 1), 2)}</span>
                </div>
                <div className="bg-white/[0.04] rounded-xl px-4 py-3 flex flex-col items-center min-w-[72px]">
                  <span className="text-[9px] text-[#6B7280] uppercase tracking-wider font-semibold mb-0.5">Avg SOT</span>
                  <span className="text-base font-black text-white tabular-nums">{fmt((ss.shotsOnTarget || 0) / (ss.appearances || 1), 2)}</span>
                </div>
                <div className="bg-[#3B82F6]/10 border border-[#3B82F6]/20 rounded-xl px-4 py-3 flex flex-col items-center min-w-[72px]">
                  <span className="text-[9px] text-[#3B82F6] uppercase tracking-wider font-semibold mb-0.5">Rating</span>
                  <span className="text-base font-black text-[#3B82F6] tabular-nums">{fmt(ss.rating, 2)}</span>
                </div>
              </section>

              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-3">Full Season Stats</div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                  <StatRow label="Goals"          value={fmt(ss.goals)}                highlight={(ss.goals ?? 0) >= 1} />
                  <StatRow label="Assists"         value={fmt(ss.assists)}              highlight={(ss.assists ?? 0) >= 1} />
                  <StatRow label="xG"             value={fmt(ss.expectedGoals, 2)}    highlight={(ss.expectedGoals ?? 0) >= 3} />
                  <StatRow label="xA"           value={fmt(ss.expectedAssists, 2)} />
                  <StatRow label="Shots"           value={fmt(ss.totalShots)} />
                  <StatRow label="On Target"      value={fmt(ss.shotsOnTarget)} />
                  <StatRow label="Key Passes"      value={fmt(ss.keyPasses)}           highlight={(ss.keyPasses ?? 0) >= 20} />
                  <StatRow label="Tackles"         value={fmt(ss.tackles)} />
                  <StatRow label="Interceptions"  value={fmt(ss.interceptions)} />
                  <StatRow label="Pass Acc." value={`${fmt(ss.accuratePassesPercentage, 1)}%`} highlight={(ss.accuratePassesPercentage ?? 0) >= 85} />
                </div>
              </div>
            </div>
          )}

          {recentGames.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#3B82F6] rounded-sm" />
                  Recent Season Log
                </h3>
              </div>
              <div className="bg-white/[0.01] rounded-xl border border-white/[0.05] overflow-hidden">
                <div className="px-3">
                  {recentGames.map((g: any, i: number) => (
                    <GameLogRow key={i} game={g} />
                  ))}
                </div>
              </div>
            </section>
          )}
          
          {(() => {
            // Resolve vsOpponent + vsHistory regardless of which drawer path was used:
            // Path 1 (player list click): data.vsOpponent = SofascoreGameLog | null, data.vsHistory = SofascoreGameLog[]
            // Path 2 (kitchen click via preData): data.vsOpponent = { lastMatchup, history }
            const hasWrapper = data?.vsOpponent && typeof data.vsOpponent === "object" && "lastMatchup" in data.vsOpponent;
            const lastMatchup: SofascoreGameLog | null = hasWrapper
              ? (data.vsOpponent as { lastMatchup: SofascoreGameLog | null }).lastMatchup
              : (data?.vsOpponent?.eventId ? data.vsOpponent : null);
            const allHistory: SofascoreGameLog[] = hasWrapper
              ? ((data.vsOpponent as { history: SofascoreGameLog[] }).history ?? [])
              : (Array.isArray(data?.vsHistory) ? data.vsHistory : []);

            // Filter to last 3 years
            const cutoff = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 3);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            const recentHistory = allHistory.filter((g: SofascoreGameLog) => g.date >= cutoffStr);

            if (!lastMatchup && recentHistory.length === 0) return null;

            return (
              <section className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-text-2">
                  vs This Opponent
                  {recentHistory.length > 1 && (
                    <span className="ml-2 text-[8px] font-normal opacity-60">last 3 years</span>
                  )}
                </div>
                <div className="bg-white/[0.01] rounded-xl border border-white/[0.05] px-3">
                  {recentHistory.length > 0
                    ? recentHistory.map((g: SofascoreGameLog, i: number) => <GameLogRow key={i} game={g} />)
                    : lastMatchup && <GameLogRow game={lastMatchup} />
                  }
                </div>
                {recentHistory.length === 0 && lastMatchup && (
                  <p className="text-[9px] text-text-2 opacity-50 px-1">Most recent matchup shown. No head-to-head in last 3 years.</p>
                )}
              </section>
            );
          })()}

          <a
            href={`https://www.sofascore.com/player/${player.name.toLowerCase().replace(/\s+/g, "-")}/${player.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[10px] text-text-2 hover:text-text-1 py-4 transition-colors"
          >
            View full history on Sofascore →
          </a>
        </div>
        
        <div className="px-6 py-4 bg-[#111827] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="text-[9px] text-[#374151] font-mono">INTEL_VERSION: 1.0.42_SOCCER</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest">Real-time stats active</span>
          </div>
        </div>
      </div>
    </>
  );
}
