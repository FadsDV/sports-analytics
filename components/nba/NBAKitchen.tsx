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
    desc: "Composite ≥ 70%. Consistent starters, full minutes.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "Composite ≥ 50%. Solid but not bulletproof.",
    color: "text-primary", border: "border-primary/25", bg: "bg-primary/5",
  },
  scorers: {
    emoji: "🏀", title: "Point Scorers",
    desc: "PTS only. Reliable scorers adjusted for minutes.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  playmakers: {
    emoji: "🎯", title: "Playmakers",
    desc: "Rebounds + assists legs only. Composite ≥ 50%.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  ballsy: {
    emoji: "🔥", title: "If You Have Balls",
    desc: "Composite 20–55%. High thresholds. Bounce-back included.",
    color: "text-[#EF4444]", border: "border-[#EF4444]/25", bg: "bg-[#EF4444]/5",
  },
  value: {
    emoji: "💰", title: "Value Picks",
    desc: "Single legs. Top reliability × odds. Price > 1.60.",
    color: "text-[#F59E0B]", border: "border-[#F59E0B]/25", bg: "bg-[#F59E0B]/5",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hrColor(r: number): string {
  if (r >= 0.80) return "text-[#22C55E]";
  if (r >= 0.70) return "text-primary";
  if (r >= 0.55) return "text-[#F59E0B]";
  return "text-[#EF4444]";
}

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1] ?? name;
}

function combinedProb(legs: NBAKitchenLeg[]): number {
  return legs.length ? legs.reduce((acc, l) => acc * l.reliability, 1) : 0;
}

// ─── Reliability breakdown tooltip ───────────────────────────────────────────

function BreakdownTooltip({ leg }: { leg: NBAKitchenLeg }) {
  const b = leg.breakdown;
  const rows: [string, string][] = [
    ["Hit rate (weighted)", `${Math.round(b.weightedHitRate * 100)}%`],
    ["Consistency",         `×${b.consistencyFactor.toFixed(2)}`],
    [`Sample (${leg.gamesAnalyzed}g)`, `×${b.sampleFactor.toFixed(2)}`],
    [`Minutes (${Math.round(leg.avgMinutes)}mpg)`, `×${b.minutesFactor.toFixed(2)}`],
  ];
  if (b.contextualBonus > 0) {
    rows.push(["Contextual bonus", `+${Math.round(b.contextualBonus * 100)}%`]);
  }

  return (
    <div className="absolute z-50 bottom-full mb-1.5 left-0 w-52 bg-bg-2 border border-border rounded-lg shadow-xl p-2.5 text-[11px]">
      <div className="font-semibold text-text-1 mb-1.5">Reliability breakdown</div>
      {rows.map(([label, val]) => (
        <div key={label} className="flex justify-between gap-2 text-text-2 py-0.5">
          <span>{label}</span>
          <span className="text-text-1 font-medium tabular-nums">{val}</span>
        </div>
      ))}
      <div className="border-t border-border/50 mt-1.5 pt-1.5 flex justify-between font-semibold">
        <span className="text-text-2">Composite</span>
        <span className={hrColor(leg.reliability)}>{Math.round(leg.reliability * 100)}%</span>
      </div>
    </div>
  );
}

// ─── Single leg row ───────────────────────────────────────────────────────────

function LegRow({ leg }: { leg: NBAKitchenLeg }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const pct = Math.round(leg.reliability * 100);

  return (
    <div className="py-2 border-b border-border last:border-0">
      {/* Top row: player + reliability */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {leg.isBounceBack && (
            <span title="Bounce-back candidate — below-average last game" className="text-[#F59E0B] text-xs shrink-0 leading-none">↺</span>
          )}
          <span className="text-xs font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
          <span className="text-[11px] text-text-2 shrink-0 font-medium">{leg.teamAbbr}</span>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className={`text-xs font-bold tabular-nums ${hrColor(leg.reliability)} hover:opacity-75 transition-opacity`}
            title="Click for breakdown"
          >
            {pct}%
          </button>
          {showBreakdown && <BreakdownTooltip leg={leg} />}
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
  const pct  = Math.round(prob * 100);

  const allOdds   = slip.legs.length > 0 && slip.legs.every(l => l.prop);
  const multiOdds = allOdds
    ? slip.legs.reduce((acc, l) => acc * (l.prop!.price), 1)
    : null;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/50">
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
          <p className="text-xs text-text-2 py-4 text-center">Not enough data</p>
        ) : (
          slip.legs.map((leg, i) => <LegRow key={i} leg={leg} />)
        )}
      </div>

      {/* Footer */}
      {slip.legs.length > 1 && (
        <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-2">All legs hit</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold tabular-nums ${hrColor(prob)}`}>~{pct}%</span>
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
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
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
            {/* Player + reliability */}
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
                {Math.round(leg.reliability * 100)}%
              </span>
            </div>
            {/* Stat */}
            <div className="text-[11px] text-primary font-semibold mb-1.5">
              ↑ {leg.threshold}+ {leg.statLabel}
            </div>
            {/* Odds */}
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
            5 cooked slips + value picks · composite scoring (minutes · consistency · recency) · based on {maxGames > 0 ? `last ${maxGames} games` : "player history"} · not betting advice
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
