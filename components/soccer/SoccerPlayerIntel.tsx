/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { SofascorePlayer, SofascoreLineup } from "@/lib/sports/sofascore";
import type { Team } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Pos = "all" | "GK" | "D" | "M" | "F";

function posGroup(pos: string): Pos {
  const p = pos.toUpperCase()[0];
  if (p === "G") return "GK";
  if (p === "D") return "D";
  if (p === "M") return "M";
  if (p === "F" || p === "A") return "F";
  return "all";
}

function posColor(pos: string) {
  const g = posGroup(pos);
  if (g === "GK") return { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" };
  if (g === "D")  return { text: "text-[#60A5FA]", bg: "bg-[#60A5FA]/10" };
  if (g === "M")  return { text: "text-[#22C55E]", bg: "bg-[#22C55E]/10" };
  if (g === "F")  return { text: "text-[#EF4444]", bg: "bg-[#EF4444]/10" };
  return { text: "text-text-2", bg: "bg-surface2" };
}

function ratingColor(r: number) {
  if (r >= 8.0) return "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30";
  if (r >= 7.5) return "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20";
  if (r >= 6.5) return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20";
  return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20";
}

function stat(p: SofascorePlayer, key: string): number | null {
  const v = p.stats[key];
  return typeof v === "number" ? v : null;
}

function fmt(v: number | null, decimals = 0): string {
  if (v == null) return "—";
  return decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
}

// ─── Player photo with Sofascore CDN ─────────────────────────────────────────

function PlayerPhoto({ id, name, size = 44 }: { id: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (failed) {
    return (
      <div
        className="rounded-full bg-surface2 border border-border flex items-center justify-center shrink-0 text-text-2 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.33 }}
      >
        {initials}
      </div>
    );
  }
  return (
    <img
      src={`https://img.sofascore.com/api/v1/player/${id}/image`}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full object-cover shrink-0 bg-surface2 border border-border/40"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg ${highlight ? "bg-primary/10" : "bg-surface2"}`}>
      <span className={`text-[11px] font-black tabular-nums ${highlight ? "text-primary" : "text-text-1"}`}>{value}</span>
      <span className="text-[8px] text-text-2 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ─── Player card ─────────────────────────────────────────────────────────────

function PlayerCard({ player, side }: { player: SofascorePlayer; side: "home" | "away" }) {
  const [expanded, setExpanded] = useState(false);
  const pc = posColor(player.position);
  const goals  = stat(player, "goals") ?? 0;
  const assists = stat(player, "goalAssist") ?? 0;
  const xg     = stat(player, "expectedGoals");
  const xa     = stat(player, "expectedAssists");
  const shots  = stat(player, "totalShots") ?? stat(player, "totalShot");
  const sot    = stat(player, "onTargetScoringAttempt");
  const kp     = stat(player, "keyPass");
  const prc    = stat(player, "progressiveBallCarriesCount");
  const tkl    = stat(player, "totalTackle");
  const intc   = stat(player, "interceptionWon");
  const mins   = player.stats.minutesPlayed ?? (player.stats.secondsPlayed != null ? Math.round((player.stats.secondsPlayed as number) / 60) : null);
  const touches = stat(player, "touches");
  const isLive  = mins != null && mins < 90;

  // Primary stats depend on position
  const g = posGroup(player.position);
  let primaryStats: { label: string; value: string; highlight?: boolean }[] = [];
  if (g === "GK") {
    const saves = stat(player, "saves");
    primaryStats = [
      { label: "saves", value: fmt(saves), highlight: (saves ?? 0) >= 3 },
      { label: "min",   value: fmt(mins) },
    ];
  } else if (g === "F") {
    primaryStats = [
      { label: "xG",  value: fmt(xg, 2),  highlight: (xg ?? 0) >= 0.4 },
      { label: "SH",  value: fmt(shots),  highlight: (shots ?? 0) >= 3 },
      { label: "SOT", value: fmt(sot),    highlight: (sot ?? 0) >= 2 },
      { label: "KP",  value: fmt(kp),     highlight: (kp ?? 0) >= 2 },
    ];
  } else if (g === "M") {
    primaryStats = [
      { label: "xA",  value: fmt(xa, 2),  highlight: (xa ?? 0) >= 0.2 },
      { label: "KP",  value: fmt(kp),     highlight: (kp ?? 0) >= 2 },
      { label: "PRC", value: fmt(prc),    highlight: (prc ?? 0) >= 3 },
      { label: "TKL", value: fmt(tkl),    highlight: (tkl ?? 0) >= 3 },
    ];
  } else {
    primaryStats = [
      { label: "TKL", value: fmt(tkl),  highlight: (tkl ?? 0) >= 3 },
      { label: "INT", value: fmt(intc), highlight: (intc ?? 0) >= 2 },
      { label: "PRC", value: fmt(prc),  highlight: (prc ?? 0) >= 2 },
    ];
  }

  return (
    <div
      className="bg-surface border border-border rounded-xl overflow-hidden cursor-pointer hover:border-border/80 transition-colors"
      onClick={() => setExpanded(e => !e)}
    >
      {/* Main row */}
      <div className="p-3 flex items-center gap-3">
        <div className="relative shrink-0">
          <PlayerPhoto id={player.id} name={player.name} size={42} />
          {!player.starter && (
            <span className="absolute -bottom-0.5 -right-0.5 text-[7px] bg-surface2 border border-border px-0.5 rounded font-bold text-text-2">SUB</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-bold text-text-1 truncate">{player.shortName}</span>
            {goals > 0 && <span className="text-sm" title={`${goals} goal${goals > 1 ? "s" : ""}`}>⚽</span>}
            {assists > 0 && <span className="text-sm" title={`${assists} assist${assists > 1 ? "s" : ""}`}>🎯</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] font-black uppercase tracking-wider px-1 py-px rounded ${pc.text} ${pc.bg}`}>
              {player.position}
            </span>
            <span className="text-[9px] text-text-2 font-mono">#{player.jerseyNumber}</span>
            {mins != null && <span className="text-[9px] text-text-2">{mins}'</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {player.rating != null && (
            <span className={`text-[11px] font-black px-2 py-1 rounded border tabular-nums ${ratingColor(player.rating)}`}>
              {player.rating.toFixed(1)}
            </span>
          )}
          <span className="text-text-2 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Stat pills row */}
      {primaryStats.some(s => s.value !== "—") && (
        <div className="px-3 pb-3 flex gap-1.5 flex-wrap">
          {primaryStats.filter(s => s.value !== "—").map(s => (
            <StatPill key={s.label} label={s.label} value={s.value} highlight={s.highlight} />
          ))}
        </div>
      )}

      {/* Expanded full stats */}
      {expanded && (
        <div className="border-t border-border/50 px-3 pt-2 pb-3 grid grid-cols-4 gap-2">
          {[
            { label: "xG",  value: fmt(xg, 2) },
            { label: "xA",  value: fmt(xa, 2) },
            { label: "SH",  value: fmt(shots) },
            { label: "SOT", value: fmt(sot) },
            { label: "KP",  value: fmt(kp) },
            { label: "PRC", value: fmt(prc) },
            { label: "TKL", value: fmt(tkl) },
            { label: "INT", value: fmt(intc) },
            { label: "TCH", value: fmt(touches) },
            { label: "MIN", value: fmt(mins) },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-[11px] font-bold tabular-nums text-text-1">{s.value}</div>
              <div className="text-[8px] text-text-2 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stat leader row ──────────────────────────────────────────────────────────

function LeaderRow({
  players, statKey, label, fmt: fmtFn, threshold,
}: {
  players: Array<SofascorePlayer & { side: "home" | "away" }>;
  statKey: string;
  label:   string;
  fmt?:    (v: number) => string;
  threshold?: number;
}) {
  const ranked = players
    .map(p => ({ p, v: stat(p, statKey) }))
    .filter(x => x.v != null && x.v > 0)
    .sort((a, b) => (b.v ?? 0) - (a.v ?? 0))
    .slice(0, 5);

  if (!ranked.length) return null;

  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-1.5">{label}</div>
      {ranked.map(({ p, v }, i) => {
        const pct = Math.min(((v ?? 0) / ((ranked[0].v ?? 1) || 1)) * 100, 100);
        const isHigh = threshold != null && (v ?? 0) >= threshold;
        return (
          <div key={p.id} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
            <span className="text-[9px] text-text-2 w-3 shrink-0 tabular-nums">{i + 1}</span>
            <PlayerPhoto id={p.id} name={p.name} size={22} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-medium text-text-1 truncate">{p.shortName}</span>
                <span className={`text-[10px] font-black tabular-nums shrink-0 ${isHigh ? "text-primary" : "text-text-1"}`}>
                  {fmtFn ? fmtFn(v ?? 0) : fmt(v)}
                </span>
              </div>
              <div className="mt-0.5 h-[2px] bg-surface2 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${isHigh ? "bg-primary" : "bg-text-2/40"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SoccerPlayerIntelProps {
  lineups:  SofascoreLineup;
  homeTeam: Team;
  awayTeam: Team;
  status:   "upcoming" | "live" | "finished";
}

export default function SoccerPlayerIntel({ lineups, homeTeam, awayTeam, status }: SoccerPlayerIntelProps) {
  const [posFilter, setPosFilter] = useState<Pos>("all");
  const [sideFilter, setSideFilter] = useState<"both" | "home" | "away">("both");

  const allPlayers = [
    ...lineups.home.map(p => ({ ...p, side: "home" as const })),
    ...lineups.away.map(p => ({ ...p, side: "away" as const })),
  ];

  const POS_FILTERS: { key: Pos; label: string }[] = [
    { key: "all", label: "All" },
    { key: "F",   label: "FWD" },
    { key: "M",   label: "MID" },
    { key: "D",   label: "DEF" },
    { key: "GK",  label: "GK" },
  ];

  const filtered = allPlayers.filter(p => {
    if (sideFilter !== "both" && p.side !== sideFilter) return false;
    if (posFilter !== "all" && posGroup(p.position) !== posFilter) return false;
    return true;
  });

  const hasMatchData = status !== "upcoming" && allPlayers.some(p => p.rating != null);

  return (
    <div className="space-y-5">

      {/* ── Stat Leaders ──────────────────────────────────────────────── */}
      {hasMatchData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* xG & Goal Threat */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">⚡ Goal Threat</div>
            <LeaderRow players={allPlayers} statKey="expectedGoals" label="xG" fmt={v => v.toFixed(2)} threshold={0.4} />
            <LeaderRow players={allPlayers} statKey="totalShots" label="Shots" threshold={3} />
            <LeaderRow players={allPlayers} statKey="onTargetScoringAttempt" label="On Target" threshold={2} />
          </div>

          {/* Creativity */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#60A5FA] mb-3">🎨 Creativity</div>
            <LeaderRow players={allPlayers} statKey="expectedAssists" label="xA" fmt={v => v.toFixed(2)} threshold={0.2} />
            <LeaderRow players={allPlayers} statKey="keyPass" label="Key Passes" threshold={2} />
            <LeaderRow players={allPlayers} statKey="progressiveBallCarriesCount" label="Prog. Carries" threshold={3} />
          </div>

          {/* Defensive Work */}
          <div className="bg-surface border border-border rounded-xl p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#22C55E] mb-3">🛡️ Defensive Work</div>
            <LeaderRow players={allPlayers} statKey="totalTackle" label="Tackles" threshold={3} />
            <LeaderRow players={allPlayers} statKey="interceptionWon" label="Interceptions" threshold={2} />
            <LeaderRow players={allPlayers} statKey="duelWon" label="Duels Won" threshold={5} />
          </div>
        </div>
      )}

      {/* ── Player Cards ──────────────────────────────────────────────── */}
      <div>
        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Position filter */}
          <div className="flex gap-1">
            {POS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setPosFilter(f.key)}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${
                  posFilter === f.key
                    ? "bg-primary text-white"
                    : "bg-surface2 text-text-2 hover:text-text-1"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border" />

          {/* Team filter */}
          <div className="flex gap-1">
            {([
              { key: "both" as const, label: "Both" },
              { key: "home" as const, label: homeTeam.shortName },
              { key: "away" as const, label: awayTeam.shortName },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setSideFilter(f.key)}
                className={`text-[10px] font-bold px-2 py-1 rounded transition-all ${
                  sideFilter === f.key
                    ? "bg-surface2 text-text-1 border border-border"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="ml-auto text-[10px] text-text-2">{filtered.length} players · tap to expand</span>
        </div>

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Home column */}
          {(sideFilter === "both" || sideFilter === "home") && (
            <div className="space-y-2">
              {sideFilter === "both" && (
                <div className="flex items-center gap-2 mb-1.5">
                  {homeTeam.logoUrl && <img src={homeTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-[10px] font-bold text-text-2 uppercase tracking-wider">{homeTeam.shortName}</span>
                  {lineups.homeFormation && (
                    <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-px rounded font-bold">{lineups.homeFormation}</span>
                  )}
                </div>
              )}
              {filtered
                .filter(p => p.side === "home")
                .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                .map(p => <PlayerCard key={p.id} player={p} side="home" />)
              }
            </div>
          )}

          {/* Away column */}
          {(sideFilter === "both" || sideFilter === "away") && (
            <div className="space-y-2">
              {sideFilter === "both" && (
                <div className="flex items-center gap-2 mb-1.5">
                  {awayTeam.logoUrl && <img src={awayTeam.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-[10px] font-bold text-text-2 uppercase tracking-wider">{awayTeam.shortName}</span>
                  {lineups.awayFormation && (
                    <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-px rounded font-bold">{lineups.awayFormation}</span>
                  )}
                </div>
              )}
              {filtered
                .filter(p => p.side === "away")
                .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                .map(p => <PlayerCard key={p.id} player={p} side="away" />)
              }
            </div>
          )}

          {/* Single column when one side filtered */}
          {sideFilter !== "both" && (
            <div />
          )}
        </div>

        {filtered.length === 0 && (
          <p className="text-xs text-text-2 text-center py-8">No players match this filter.</p>
        )}
      </div>

      {/* Disclaimer */}
      {!hasMatchData && (
        <div className="text-center py-8">
          <p className="text-xs text-text-2">Player intel available after lineups are confirmed.</p>
          <p className="text-[10px] text-text-2/60 mt-1">Stats shown once the match is underway.</p>
        </div>
      )}
    </div>
  );
}
