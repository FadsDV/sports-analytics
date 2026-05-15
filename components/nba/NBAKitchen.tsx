/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { NBAKitchenSlip, NBAKitchenLeg, NBAKitchenSlipType } from "@/lib/sports/nba/kitchen";

// ─── Slip display config ──────────────────────────────────────────────────────

const SLIP_CONFIG: Record<NBAKitchenSlipType, {
  emoji:  string;
  title:  string;
  desc:   string;
  color:  string;
  border: string;
  bg:     string;
}> = {
  safe: {
    emoji: "🛡️", title: "Safe",
    desc: "Top 3 legs. Each scores 5.5+/10. Best combined hit chance.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "Next best 3 legs. Reliable picks, slightly harder thresholds.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  scorers: {
    emoji: "🏀", title: "Point Scorers",
    desc: "PTS only. Reliable scorers adjusted for minutes.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  playmakers: {
    emoji: "🎯", title: "Playmakers",
    desc: "Rebounds + assists legs only.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  ballsy: {
    emoji: "🔥", title: "If You Have Balls",
    desc: "Bold 3-leg picks. ▲ = on-form player pushed to harder threshold.",
    color: "text-[#EF4444]", border: "border-[#EF4444]/25", bg: "bg-[#EF4444]/5",
  },
  value: {
    emoji: "💰", title: "Value Picks",
    desc: "Single legs. Top reliability × odds. Price > 1.60.",
    color: "text-[#F59E0B]", border: "border-[#F59E0B]/25", bg: "bg-[#F59E0B]/5",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Reliability score out of 10, 1 decimal place. e.g. 0.75 → "7.5" */
function scoreOf10(r: number): string {
  const s = Math.round(r * 100) / 10;
  return s % 1 === 0 ? s.toFixed(0) : s.toFixed(1);
}

/**
 * Colour by reliability score (out of 10):
 *  9.0+ → green  #22C55E (very reliable)
 *  7.0+ → blue   #60A5FA (good)
 *  5.0+ → amber  #F59E0B (moderate)
 *  3.0+ → orange #F97316 (risky)
 *  <3.0 → red    #EF4444 (long shot, covers ≤1.5 per spec)
 */
function hrColor(r: number): string {
  if (r >= 0.90) return "text-[#22C55E]";
  if (r >= 0.70) return "text-[#60A5FA]";
  if (r >= 0.50) return "text-[#F59E0B]";
  if (r >= 0.30) return "text-[#F97316]";
  return "text-[#EF4444]";
}

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1] ?? name;
}

function combinedProb(legs: NBAKitchenLeg[]): number {
  return legs.length ? legs.reduce((acc, l) => acc * l.reliability, 1) : 0;
}

// ─── All legs hit tooltip ─────────────────────────────────────────────────────

function AllLegsHitLabel() {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="flex items-center gap-1 text-[11px] text-text-2 hover:text-text-1 transition-colors"
      >
        All legs hit
        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-2/40 text-[9px] text-text-2/60 leading-none">?</span>
      </button>
      {show && (
        <div className="absolute z-[100] bottom-full mb-2 left-0 w-56 bg-bg-2 border border-border rounded-lg shadow-xl p-2.5 text-[11px]">
          <p className="text-text-1 font-semibold mb-1">Parlay probability</p>
          <p className="text-text-2 leading-snug">
            Estimated chance every leg in this slip hits — each leg&apos;s reliability score multiplied together.
          </p>
          <p className="text-text-2/70 mt-1.5 text-[10px]">
            Treats legs as independent. Real correlation may differ.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Reliability breakdown tooltip ───────────────────────────────────────────

function BreakdownTooltip({ leg, onClose }: { leg: NBAKitchenLeg; onClose: () => void }) {
  const b = leg.breakdown;
  const rows: [string, string][] = [
    ["Hit rate (weighted)", `${Math.round(b.weightedHitRate * 100)}%`],
    ["Consistency",         `×${b.consistencyFactor.toFixed(2)}`],
    [`Sample (${leg.gamesAnalyzed}g)`, `×${b.sampleFactor.toFixed(2)}`],
    [`Minutes (${Math.round(leg.avgMinutes)}mpg)`, `×${b.minutesFactor.toFixed(2)}`],
  ];
  if (b.contextualBonus > 0) {
    rows.push(["Contextual bonus", `+${(b.contextualBonus * 10).toFixed(1)}`]);
  }

  return (
    <>
      {/* Backdrop to close */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div className="absolute z-[100] bottom-full mb-1.5 right-0 w-52 bg-bg-2 border border-border rounded-lg shadow-xl p-2.5 text-[11px]">
        <div className="font-semibold text-text-1 mb-1.5">Reliability breakdown</div>
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-2 text-text-2 py-0.5">
            <span>{label}</span>
            <span className="text-text-1 font-medium tabular-nums">{val}</span>
          </div>
        ))}
        <div className="border-t border-border/50 mt-1.5 pt-1.5 flex justify-between font-semibold">
          <span className="text-text-2">Reliability score</span>
          <span className={hrColor(leg.reliability)}>{scoreOf10(leg.reliability)} / 10</span>
        </div>
      </div>
    </>
  );
}

// ─── Single leg row ───────────────────────────────────────────────────────────

function LegRow({ leg }: { leg: NBAKitchenLeg }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="py-2 border-b border-border last:border-0">
      {/* Top row: player + score */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {leg.isOnForm && (
            <span title="On form — last 3 games above season average" className="text-[#22C55E] text-[10px] shrink-0 leading-none font-bold">▲</span>
          )}
          {leg.isBounceBack && !leg.isOnForm && (
            <span title="Bounce-back candidate — below-average last game" className="text-[#F59E0B] text-xs shrink-0 leading-none">↺</span>
          )}
          <span className="text-xs font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
          <span className="text-[11px] text-text-2 shrink-0 font-medium">{leg.teamAbbr}</span>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className={`text-xs font-bold tabular-nums ${hrColor(leg.reliability)} hover:opacity-75 transition-opacity`}
            title="Click for reliability breakdown"
          >
            {scoreOf10(leg.reliability)}
          </button>
          {showBreakdown && (
            <BreakdownTooltip leg={leg} onClose={() => setShowBreakdown(false)} />
          )}
        </div>
      </div>
      {/* Threshold + odds */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px] text-primary font-semibold">
          ↑ {leg.threshold}+ {leg.statLabel}
        </span>
        {leg.prop ? (
          <span className="text-[11px] text-text-2 shrink-0 tabular-nums">
            @<span className="text-text-1 font-bold">{leg.prop.price.toFixed(2)}</span>
          </span>
        ) : null}
      </div>
      {/* Avg + minutes context */}
      <div className="text-[10px] text-text-2 mt-0.5">
        avg {leg.avgStat}
        {leg.avgMinutes > 0 && <span className="ml-1">· {Math.round(leg.avgMinutes)}mpg</span>}
        <span className="ml-1">· {leg.gamesAnalyzed}g</span>
      </div>
    </div>
  );
}

// ─── Slip card ────────────────────────────────────────────────────────────────

function SlipCard({ slip }: { slip: NBAKitchenSlip }) {
  const cfg  = SLIP_CONFIG[slip.type];
  const prob = combinedProb(slip.legs);

  const allOdds   = slip.legs.length > 0 && slip.legs.every(l => l.prop);
  const multiOdds = allOdds
    ? slip.legs.reduce((acc, l) => acc * (l.prop!.price), 1)
    : null;

  return (
    // overflow-visible so breakdown tooltips aren't clipped by the card edge
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} flex flex-col`}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/50 rounded-t-xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{cfg.emoji}</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.title}</span>
          </div>
          <span className="text-[11px] text-text-2 font-medium">{slip.legs.length} leg{slip.legs.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="text-[11px] text-text-2 leading-snug">{cfg.desc}</p>
      </div>

      {/* Legs */}
      <div className="px-3 flex-1">
        {slip.legs.length === 0 ? (
          <div className="py-4 text-center space-y-1">
            <p className="text-xs text-text-2">No legs met the threshold</p>
            <p className="text-[10px] text-text-2/60">Need more game history or higher consistency</p>
          </div>
        ) : (
          slip.legs.map((leg, i) => <LegRow key={i} leg={leg} />)
        )}
      </div>

      {/* Footer */}
      {slip.legs.length > 1 && (
        <div className="px-3 py-2 border-t border-border/50 rounded-b-xl flex items-center justify-between gap-2">
          <AllLegsHitLabel />
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tabular-nums ${hrColor(prob)}`}>~{scoreOf10(prob)}</span>
            {multiOdds && (
              <span className="text-[11px] text-text-2 tabular-nums">
                ~<span className="text-text-1 font-bold">{multiOdds.toFixed(1)}x</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Value picks section ──────────────────────────────────────────────────────

function ValuePicks({ legs }: { legs: NBAKitchenLeg[] }) {
  const cfg = SLIP_CONFIG.value;
  if (legs.length === 0) return null;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg}`}>
      <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
        <span className="text-base">{cfg.emoji}</span>
        <div>
          <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.title}</span>
          <p className="text-[11px] text-text-2 mt-0.5">{cfg.desc}</p>
        </div>
        <span className="ml-auto text-[11px] text-text-2 font-medium">{legs.length} picks</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
        {legs.map((leg, i) => (
          <div key={i} className="p-3 border-b border-r border-border/40 last:border-r-0">
            <div className="flex items-start justify-between gap-1 mb-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {leg.isBounceBack && (
                    <span title="Bounce-back candidate" className="text-[#F59E0B] text-xs leading-none">↺</span>
                  )}
                  <span className="text-xs font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
                  <span className="text-[11px] text-text-2 font-medium">{leg.teamAbbr}</span>
                </div>
              </div>
              <span className={`text-xs font-bold tabular-nums shrink-0 ${hrColor(leg.reliability)}`}>
                {scoreOf10(leg.reliability)}
              </span>
            </div>
            <div className="text-[11px] text-primary font-semibold mb-1.5">
              ↑ {leg.threshold}+ {leg.statLabel}
            </div>
            {leg.prop && (
              <div className="text-[11px] text-text-2 leading-tight">
                <span className="text-text-1 font-bold">@{leg.prop.price.toFixed(2)}</span>
                <span className="ml-1 text-text-2">{leg.prop.bookmaker.split(" ")[0]}</span>
              </div>
            )}
            <div className="text-[10px] text-text-2 mt-1">
              avg {leg.avgStat}
              {leg.avgMinutes > 0 && <span className="ml-1">· {Math.round(leg.avgMinutes)}mpg</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NBAKitchen({ slips }: { slips: NBAKitchenSlip[] }) {
  const mainSlips = slips.filter(s => s.type !== "value");
  const valueSlip = slips.find(s => s.type === "value");
  const allLegs   = slips.flatMap(s => s.legs);
  const maxGames  = allLegs.length ? Math.max(...allLegs.map(l => l.gamesAnalyzed)) : 0;

  return (
    <div className="space-y-4 pb-4">

      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-2xl">🍳</span>
        <div>
          <h2 className="text-sm font-bold text-text-1 tracking-wide">The Kitchen</h2>
          <p className="text-xs text-text-2">
            5 cooked slips + value picks · reliability scored out of 10 · based on {maxGames > 0 ? `last ${maxGames} games` : "player history"} · not betting advice
          </p>
        </div>
      </div>

      {/* 5 main slips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {mainSlips.map(slip => (
          <SlipCard key={slip.type} slip={slip} />
        ))}
      </div>

      {/* Value picks */}
      {valueSlip && <ValuePicks legs={valueSlip.legs} />}

    </div>
  );
}
