/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import type { SofascorePlayer } from "@/lib/sports/sofascore";

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

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 text-center ${highlight ? "bg-primary/10 border border-primary/20" : "bg-surface2"}`}>
      <div className={`text-base font-black tabular-nums leading-none ${highlight ? "text-primary" : "text-text-1"}`}>{value}</div>
      <div className="text-[9px] text-text-2 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-text-2">{label}</span>
      <span className={`text-[11px] font-bold tabular-nums ${highlight ? "text-primary" : "text-text-1"}`}>{value}</span>
    </div>
  );
}

function PlayerPhoto({ id, name, size = 80 }: { id: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (failed) {
    return (
      <div
        className="rounded-full bg-surface2 border-2 border-border flex items-center justify-center text-text-1 font-black"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
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
      className="rounded-full object-cover bg-surface2 border-2 border-border/40"
      style={{ width: size, height: size }}
    />
  );
}

interface SoccerPlayerDrawerProps {
  player:   SofascorePlayer;
  teamName: string;
  onClose:  () => void;
}

function s(player: SofascorePlayer, key: string): number | null {
  const v = player.stats[key];
  return typeof v === "number" ? v : null;
}

function fmt(v: number | null, dec = 0): string {
  if (v == null) return "—";
  return dec > 0 ? v.toFixed(dec) : String(Math.round(v));
}

export default function SoccerPlayerDrawer({ player, teamName, onClose }: SoccerPlayerDrawerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const mins    = player.stats.minutesPlayed ?? (player.stats.secondsPlayed != null ? Math.round((player.stats.secondsPlayed as number) / 60) : null);
  const goals   = s(player, "goals");
  const assists = s(player, "goalAssist");
  const xg      = s(player, "expectedGoals");
  const xa      = s(player, "expectedAssists");
  const shots   = s(player, "totalShots") ?? s(player, "totalShot");
  const sot     = s(player, "onTargetScoringAttempt");
  const kp      = s(player, "keyPass");
  const prc     = s(player, "progressiveBallCarriesCount");
  const tkl     = s(player, "totalTackle");
  const intc    = s(player, "interceptionWon");
  const duelW   = s(player, "duelWon");
  const duelL   = s(player, "duelLost");
  const touches = s(player, "touches");
  const pct     = s(player, "accuratePassesPercentage") ?? s(player, "passAccuracy");
  const passAcc = s(player, "accuratePass");
  const saves   = s(player, "saves");
  const posGroup = player.position.toUpperCase()[0];

  // Primary hero stats by position
  const heroStats: { label: string; value: string; highlight?: boolean }[] =
    posGroup === "G" ? [
      { label: "Saves",   value: fmt(saves),       highlight: (saves ?? 0) >= 3 },
      { label: "Minutes", value: fmt(mins) },
      { label: "Rating",  value: player.rating != null ? player.rating.toFixed(1) : "—", highlight: (player.rating ?? 0) >= 7.5 },
    ] : posGroup === "D" ? [
      { label: "Tackles", value: fmt(tkl),  highlight: (tkl ?? 0) >= 3 },
      { label: "INT",     value: fmt(intc), highlight: (intc ?? 0) >= 2 },
      { label: "PRC",     value: fmt(prc),  highlight: (prc ?? 0) >= 2 },
    ] : posGroup === "M" ? [
      { label: "xA",    value: fmt(xa, 2), highlight: (xa ?? 0) >= 0.2 },
      { label: "KP",    value: fmt(kp),    highlight: (kp ?? 0) >= 2 },
      { label: "PRC",   value: fmt(prc),   highlight: (prc ?? 0) >= 3 },
    ] : [
      { label: "xG",  value: fmt(xg, 2), highlight: (xg ?? 0) >= 0.4 },
      { label: "SH",  value: fmt(shots), highlight: (shots ?? 0) >= 3 },
      { label: "SOT", value: fmt(sot),   highlight: (sot ?? 0) >= 2 },
    ];

  const duelTotal = (duelW ?? 0) + (duelL ?? 0);
  const duelPct   = duelTotal > 0 ? Math.round(((duelW ?? 0) / duelTotal) * 100) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-[320px] max-w-[90vw] bg-bg border-l border-border z-50 overflow-y-auto transition-transform duration-300"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-2">{teamName}</span>
          <button
            onClick={onClose}
            className="text-text-2 hover:text-text-1 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Player identity */}
          <div className="flex items-center gap-4">
            <PlayerPhoto id={player.id} name={player.name} size={72} />
            <div className="flex-1 min-w-0">
              <div className="text-base font-black text-text-1 leading-tight">{player.name}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${posColor(player.position)}`}>
                  {player.position}
                </span>
                <span className="text-[10px] text-text-2 font-mono">#{player.jerseyNumber}</span>
                {!player.starter && (
                  <span className="text-[9px] text-text-2 bg-surface2 border border-border px-1 py-px rounded">SUB</span>
                )}
              </div>
              {mins != null && (
                <div className="text-[10px] text-text-2 mt-1">{mins} min played</div>
              )}
            </div>
            {player.rating != null && (
              <div className={`flex-shrink-0 text-xl font-black px-3 py-2 rounded-xl border-2 tabular-nums ${ratingColor(player.rating)}`}>
                {player.rating.toFixed(1)}
              </div>
            )}
          </div>

          {/* Hero stats */}
          <div className="grid grid-cols-3 gap-2">
            {heroStats.map(h => (
              <StatBox key={h.label} label={h.label} value={h.value} highlight={h.highlight} />
            ))}
          </div>

          {/* Goal involvement */}
          {(goals != null || assists != null || xg != null || xa != null) && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">Goal Involvement</div>
              {goals != null    && <StatRow label="Goals"   value={fmt(goals)}        highlight={(goals ?? 0) >= 1} />}
              {assists != null  && <StatRow label="Assists"  value={fmt(assists)}      highlight={(assists ?? 0) >= 1} />}
              {xg != null       && <StatRow label="xG"       value={fmt(xg, 2)}        highlight={(xg ?? 0) >= 0.4} />}
              {xa != null       && <StatRow label="xA"       value={fmt(xa, 2)}        highlight={(xa ?? 0) >= 0.2} />}
              {shots != null    && <StatRow label="Shots"    value={fmt(shots)}        highlight={(shots ?? 0) >= 3} />}
              {sot != null      && <StatRow label="On Target" value={fmt(sot)}         highlight={(sot ?? 0) >= 2} />}
            </div>
          )}

          {/* Creation */}
          {(kp != null || prc != null || pct != null || passAcc != null) && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">Creation & Possession</div>
              {kp != null      && <StatRow label="Key Passes"        value={fmt(kp)}       highlight={(kp ?? 0) >= 2} />}
              {prc != null     && <StatRow label="Prog. Carries"     value={fmt(prc)}      highlight={(prc ?? 0) >= 3} />}
              {touches != null && <StatRow label="Touches"           value={fmt(touches)} />}
              {pct != null     && <StatRow label="Pass Accuracy"     value={`${fmt(pct)}%`} highlight={(pct ?? 0) >= 90} />}
              {passAcc != null && <StatRow label="Accurate Passes"   value={fmt(passAcc)} />}
            </div>
          )}

          {/* Defensive */}
          {(tkl != null || intc != null || duelW != null || saves != null) && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">Defensive</div>
              {tkl != null   && <StatRow label="Tackles"        value={fmt(tkl)}   highlight={(tkl ?? 0) >= 3} />}
              {intc != null  && <StatRow label="Interceptions"  value={fmt(intc)}  highlight={(intc ?? 0) >= 2} />}
              {duelW != null && <StatRow label="Duels Won"      value={duelPct != null ? `${fmt(duelW)} (${duelPct}%)` : fmt(duelW)} highlight={(duelW ?? 0) >= 5} />}
              {saves != null && <StatRow label="Saves"          value={fmt(saves)} highlight={(saves ?? 0) >= 3} />}
            </div>
          )}

          {/* Sofascore link */}
          <a
            href={`https://www.sofascore.com/player/${player.name.toLowerCase().replace(/\s+/g, "-")}/${player.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[10px] text-text-2 hover:text-text-1 py-2 transition-colors"
          >
            View on Sofascore →
          </a>
        </div>
      </div>
    </>
  );
}
