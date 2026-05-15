/* eslint-disable @next/next/no-img-element */
"use client";

import type { KitchenSlip, KitchenLeg, KitchenSlipType } from "@/lib/sports/afl/kitchen";

// ─── Slip display config ──────────────────────────────────────────────────────

const SLIP_CONFIG: Record<KitchenSlipType, {
  emoji:   string;
  title:   string;
  desc:    string;
  color:   string;
  border:  string;
  bg:      string;
}> = {
  safe: {
    emoji: "🛡️", title: "Safe",
    desc: "80%+ reliability per leg. Conservative thresholds.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "70%+ per leg. A step up from safe.",
    color: "text-primary", border: "border-primary/25", bg: "bg-primary/5",
  },
  goalscorers: {
    emoji: "🎯", title: "Goal Scorers",
    desc: "Reliable finishers. 1+ goal each.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  disposals: {
    emoji: "📋", title: "Disposals Only",
    desc: "Pure disposal legs. No other stats.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  ballsy: {
    emoji: "🔥", title: "If You Have Balls",
    desc: "40–62% chance. High thresholds. Bounce-back value.",
    color: "text-[#EF4444]", border: "border-[#EF4444]/25", bg: "bg-[#EF4444]/5",
  },
  value: {
    emoji: "💰", title: "Value Picks",
    desc: "Single legs. Top reliability × odds > 1.60.",
    color: "text-[#F59E0B]", border: "border-[#F59E0B]/25", bg: "bg-[#F59E0B]/5",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hrColor(hr: number): string {
  if (hr >= 0.80) return "text-[#22C55E]";
  if (hr >= 0.70) return "text-primary";
  if (hr >= 0.55) return "text-[#F59E0B]";
  return "text-[#F97316]";
}

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1] ?? name;
}

function combinedProb(legs: KitchenLeg[]): number {
  return legs.length ? legs.reduce((acc, l) => acc * l.hitRate, 1) : 0;
}

// ─── Single leg row ───────────────────────────────────────────────────────────

function LegRow({ leg }: { leg: KitchenLeg }) {
  const pct = Math.round(leg.hitRate * 100);
  return (
    <div className="py-1.5 border-b border-border last:border-0">
      {/* Top row: player + hit rate */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          {leg.isBounceBack && (
            <span title="Bounce-back candidate — below-average last game" className="text-[#F59E0B] text-[9px] shrink-0">↺</span>
          )}
          <span className="text-[10px] font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
          <span className="text-[9px] text-text-2 shrink-0">{leg.teamAbbr}</span>
        </div>
        <span className={`text-[10px] font-bold tabular-nums shrink-0 ${hrColor(leg.hitRate)}`}>{pct}%</span>
      </div>
      {/* Bottom row: threshold + odds */}
      <div className="flex items-center justify-between gap-1 mt-0.5">
        <span className="text-[10px] text-primary font-medium">
          ↑ {leg.threshold}+ {leg.statLabel}
        </span>
        {leg.prop ? (
          <span className="text-[9px] text-text-2 shrink-0 tabular-nums">
            @<span className="text-text-1 font-semibold">{leg.prop.price.toFixed(2)}</span>
          </span>
        ) : null}
      </div>
      {/* Avg context */}
      <div className="text-[8px] text-text-2 mt-0.5">
        avg {leg.avgStat} · {leg.gamesAnalyzed}g
      </div>
    </div>
  );
}

// ─── Slip card (5 main slips) ─────────────────────────────────────────────────

function SlipCard({ slip }: { slip: KitchenSlip }) {
  const cfg   = SLIP_CONFIG[slip.type];
  const prob  = combinedProb(slip.legs);
  const pct   = Math.round(prob * 100);

  // Combined multi odds when all legs have props
  const allOdds = slip.legs.length > 0 && slip.legs.every(l => l.prop);
  const multiOdds = allOdds
    ? slip.legs.reduce((acc, l) => acc * (l.prop!.price), 1)
    : null;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} flex flex-col overflow-hidden`}>
      {/* Card header */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{cfg.emoji}</span>
            <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.title}</span>
          </div>
          <span className="text-[9px] text-text-2">{slip.legs.length} leg{slip.legs.length !== 1 ? "s" : ""}</span>
        </div>
        <p className="text-[9px] text-text-2 leading-snug">{cfg.desc}</p>
      </div>

      {/* Legs */}
      <div className="px-3 flex-1">
        {slip.legs.length === 0 ? (
          <p className="text-[10px] text-text-2 py-4 text-center">Not enough data</p>
        ) : (
          slip.legs.map((leg, i) => <LegRow key={i} leg={leg} />)
        )}
      </div>

      {/* Footer */}
      {slip.legs.length > 1 && (
        <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2">
          <span className="text-[9px] text-text-2">All legs hit</span>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold tabular-nums ${hrColor(prob)}`}>~{pct}%</span>
            {multiOdds && (
              <span className="text-[9px] text-text-2 tabular-nums">
                ~<span className="text-text-1 font-semibold">{multiOdds.toFixed(1)}x</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Value picks section (full-width) ─────────────────────────────────────────

function ValuePicks({ legs }: { legs: KitchenLeg[] }) {
  const cfg = SLIP_CONFIG.value;
  if (legs.length === 0) return null;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-2">
        <span className="text-base">{cfg.emoji}</span>
        <div>
          <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.title}</span>
          <p className="text-[9px] text-text-2">{cfg.desc}</p>
        </div>
        <span className="ml-auto text-[9px] text-text-2">{legs.length} picks</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
        {legs.map((leg, i) => (
          <div key={i} className="p-3 border-b border-r border-border/40 last:border-r-0">
            {/* Player + hit rate */}
            <div className="flex items-start justify-between gap-1 mb-1">
              <div className="min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  {leg.isBounceBack && (
                    <span title="Bounce-back candidate" className="text-[#F59E0B] text-[9px]">↺</span>
                  )}
                  <span className="text-[10px] font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
                  <span className="text-[9px] text-text-2">{leg.teamAbbr}</span>
                </div>
              </div>
              <span className={`text-[10px] font-bold tabular-nums shrink-0 ${hrColor(leg.hitRate)}`}>
                {Math.round(leg.hitRate * 100)}%
              </span>
            </div>
            {/* Stat */}
            <div className="text-[10px] text-primary font-medium mb-1">
              ↑ {leg.threshold}+ {leg.statLabel}
            </div>
            {/* Odds */}
            {leg.prop && (
              <div className="text-[9px] text-text-2 leading-tight">
                <span className="text-text-1 font-semibold">@{leg.prop.price.toFixed(2)}</span>
                <span className="ml-1">{leg.prop.bookmaker.split(" ")[0]}</span>
              </div>
            )}
            <div className="text-[8px] text-text-2 mt-0.5">avg {leg.avgStat}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AFLKitchen({ slips }: { slips: KitchenSlip[] }) {
  const mainSlips  = slips.filter(s => s.type !== "value");
  const valueSlip  = slips.find(s => s.type === "value");
  const allLegs    = slips.flatMap(s => s.legs);
  const maxGames   = allLegs.length ? Math.max(...allLegs.map(l => l.gamesAnalyzed)) : 0;

  return (
    <div className="space-y-4 pb-4">

      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-2xl">🍳</span>
        <div>
          <h2 className="text-sm font-bold text-text-1 tracking-wide">The Kitchen</h2>
          <p className="text-[10px] text-text-2">
            5 cooked slips + value picks · based on {maxGames > 0 ? `last ${maxGames} games` : "player history"} · not betting advice
          </p>
        </div>
      </div>

      {/* 5 main slips — responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {mainSlips.map(slip => (
          <SlipCard key={slip.type} slip={slip} />
        ))}
      </div>

      {/* Value picks — full width */}
      {valueSlip && <ValuePicks legs={valueSlip.legs} />}

    </div>
  );
}
