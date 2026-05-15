/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { NBAKitchenSlip, NBAKitchenLeg, NBAKitchenSlipType } from "@/lib/sports/nba/kitchen";
import {
  getConfidenceTier,
  CONFIDENCE_LABEL,
  CONFIDENCE_COLORS,
  CONFIDENCE_HEX,
} from "@/lib/sports/reliability/labels";

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
    desc: "High-probability consistency plays. Threshold set well below average.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "Reliable picks with stronger returns. Slightly harder thresholds.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  scorers: {
    emoji: "🏀", title: "Point Scorers",
    desc: "Best scoring trends. Points only, minutes-adjusted.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  playmakers: {
    emoji: "🎯", title: "Playmakers",
    desc: "Rebounds + assists legs. Volume and consistency plays.",
    color: "text-[#14B8A6]", border: "border-[#14B8A6]/25", bg: "bg-[#14B8A6]/5",
  },
  ballsy: {
    emoji: "🔥", title: "If You Have Balls",
    desc: "High-upside momentum plays. On-form players pushed above their recent average.",
    color: "text-[#EF4444]", border: "border-[#EF4444]/25", bg: "bg-[#EF4444]/5",
  },
  value: {
    emoji: "💰", title: "Value Picks",
    desc: "Bookmaker lines priced below projected output. Edge = avg minus book line.",
    color: "text-[#F59E0B]", border: "border-[#F59E0B]/25", bg: "bg-[#F59E0B]/5",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lastName(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1] ?? name;
}

function combinedProb(legs: NBAKitchenLeg[]): number {
  return legs.length ? legs.reduce((acc, l) => acc * l.reliability, 1) : 0;
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ reliability, onClick }: { reliability: number; onClick?: () => void }) {
  const tier   = getConfidenceTier(reliability);
  const colors = CONFIDENCE_COLORS[tier];
  const pct    = Math.round(reliability * 100);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-end gap-0.5 shrink-0 group cursor-pointer"
      title="Click for reliability breakdown"
    >
      <span className={`text-[10px] font-black uppercase tracking-wider ${colors.text} group-hover:opacity-75 transition-opacity`}>
        {CONFIDENCE_LABEL[tier]}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="w-12 h-[3px] bg-border/40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${colors.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] tabular-nums font-bold ${colors.text}`}>{pct}%</span>
      </div>
    </button>
  );
}

// ─── Reliability breakdown tooltip ───────────────────────────────────────────

function BreakdownTooltip({ leg, onClose }: { leg: NBAKitchenLeg; onClose: () => void }) {
  const b    = leg.breakdown;
  const tier = getConfidenceTier(leg.reliability);
  const c    = CONFIDENCE_COLORS[tier];

  const rows: [string, string][] = [
    ["Weighted hit rate",        `${Math.round(b.weightedHitRate * 100)}%`],
    ["Consistency factor",       `×${b.consistencyFactor.toFixed(2)}`],
    [`Sample (${leg.gamesAnalyzed}g)`, `×${b.sampleFactor.toFixed(2)}`],
  ];
  if (b.minutesFactor < 1.0 && b.minutesFactor > 0) {
    rows.push(["Minutes factor", `×${b.minutesFactor.toFixed(2)}`]);
  }
  if (b.contextualBonus > 0) {
    rows.push(["Contextual bonus", `+${Math.round(b.contextualBonus * 100)}%`]);
  }

  return (
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div className="absolute z-[100] bottom-full mb-1.5 right-0 w-56 bg-bg-2 border border-border rounded-lg shadow-xl p-3 text-[11px]">
        <div className="font-semibold text-text-1 mb-2">Why this confidence?</div>
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-2 text-text-2 py-0.5">
            <span>{label}</span>
            <span className="text-text-1 font-medium tabular-nums">{val}</span>
          </div>
        ))}
        <div className="border-t border-border/50 mt-2 pt-2">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${c.text}`}>
              {CONFIDENCE_LABEL[tier]}
            </span>
            <span className={`text-xs font-bold tabular-nums ${c.text}`}>
              {Math.round(leg.reliability * 100)}%
            </span>
          </div>
          <div className="h-[3px] bg-border/40 rounded-full overflow-hidden mt-1.5">
            <div className={`h-full rounded-full ${c.bar}`}
              style={{ width: `${Math.round(leg.reliability * 100)}%` }} />
          </div>
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
      {/* Top row: player + confidence badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 pt-0.5">
          {leg.isOnForm && (
            <span title="On form — last 3 games above season average"
              className="text-[#22C55E] text-[10px] shrink-0 leading-none font-black">▲</span>
          )}
          {leg.isBounceBack && !leg.isOnForm && (
            <span title="Bounce-back candidate — below-average last game"
              className="text-[#F59E0B] text-xs shrink-0 leading-none">↺</span>
          )}
          <span className="text-xs font-semibold text-text-1 truncate">{lastName(leg.player)}</span>
          <span className="text-[11px] text-text-2 shrink-0 font-medium">{leg.teamAbbr}</span>
        </div>
        <div className="relative shrink-0">
          <ConfidenceBadge reliability={leg.reliability} onClick={() => setShowBreakdown(v => !v)} />
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
      {/* Context */}
      <div className="text-[10px] text-text-2 mt-0.5">
        avg {leg.avgStat}
        {leg.avgMinutes > 0 && <span className="ml-1">· {Math.round(leg.avgMinutes)}mpg</span>}
        <span className="ml-1">· {leg.gamesAnalyzed}g</span>
      </div>
    </div>
  );
}

// ─── Slip footer: combined hit chance ────────────────────────────────────────

function CombinedHitChance({ legs }: { legs: NBAKitchenLeg[] }) {
  const [show, setShow] = useState(false);
  const prob = combinedProb(legs);
  const pct  = Math.round(prob * 100);
  const tier = getConfidenceTier(prob);
  const c    = CONFIDENCE_COLORS[tier];

  const allOdds   = legs.every(l => l.prop);
  const multiOdds = allOdds ? legs.reduce((acc, l) => acc * (l.prop!.price), 1) : null;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="relative">
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className="flex items-center gap-1 text-[11px] text-text-2 hover:text-text-1 transition-colors"
        >
          Hit chance
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-2/40 text-[9px] text-text-2/60 leading-none">?</span>
        </button>
        {show && (
          <div className="absolute z-[100] bottom-full mb-2 left-0 w-60 bg-bg-2 border border-border rounded-lg shadow-xl p-2.5 text-[11px]">
            <p className="text-text-1 font-semibold mb-1">Combined hit probability</p>
            <p className="text-text-2 leading-snug">
              Each leg&apos;s reliability multiplied together — estimated chance all legs hit in the same game.
            </p>
            <p className="text-text-2/70 mt-1.5 text-[10px]">
              Treated as independent. Real-world correlation may differ.
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold tabular-nums ${c.text}`}>~{pct}%</span>
        {multiOdds && (
          <span className="text-[11px] text-text-2 tabular-nums">
            ~<span className="text-text-1 font-bold">{multiOdds.toFixed(1)}x</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Slip card ────────────────────────────────────────────────────────────────

function SlipCard({ slip }: { slip: NBAKitchenSlip }) {
  const cfg = SLIP_CONFIG[slip.type];

  return (
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
        <div className="px-3 py-2 border-t border-border/50 rounded-b-xl">
          <CombinedHitChance legs={slip.legs} />
        </div>
      )}
    </div>
  );
}

// ─── Value picks section ──────────────────────────────────────────────────────

function ValuePickCard({ leg }: { leg: NBAKitchenLeg }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const tier   = getConfidenceTier(leg.reliability);
  const colors = CONFIDENCE_COLORS[tier];
  const hex    = CONFIDENCE_HEX[tier];

  return (
    <div className="p-3 border-b border-r border-border/30 last:border-r-0 flex flex-col gap-2">
      {/* Player header */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {leg.isOnForm && (
              <span title="On form" className="text-[#22C55E] text-[10px] font-black leading-none">▲</span>
            )}
            {leg.isBounceBack && !leg.isOnForm && (
              <span title="Bounce-back candidate" className="text-[#F59E0B] text-xs leading-none">↺</span>
            )}
            <span className="text-xs font-bold text-text-1 truncate">{lastName(leg.player)}</span>
            <span className="text-[11px] text-text-2 font-medium">{leg.teamAbbr}</span>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className={`text-[10px] font-black uppercase tracking-wide ${colors.text} hover:opacity-75 transition-opacity`}
          >
            {CONFIDENCE_LABEL[tier]}
          </button>
          {showBreakdown && (
            <BreakdownTooltip leg={leg} onClose={() => setShowBreakdown(false)} />
          )}
        </div>
      </div>

      {/* Stat type */}
      <div className="text-[10px] text-text-2">{leg.statLabel} · {leg.gamesAnalyzed}g</div>

      {/* Avg → Line */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-2">avg</span>
        <span className="text-sm font-bold text-text-1 tabular-nums">{leg.avgStat}</span>
        <span className="text-[10px] text-text-2/50">→</span>
        <span className="text-sm font-bold text-text-1 tabular-nums">{leg.threshold}</span>
        <span className="text-[11px] text-text-2">line</span>
      </div>

      {/* Edge badge + odds */}
      <div className="flex items-center justify-between gap-1">
        {leg.edge != null && (
          <span
            className={`text-xs font-black tabular-nums px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}
            style={{ border: `1px solid ${hex}40` }}
          >
            +{leg.edge} edge
          </span>
        )}
        {leg.prop && (
          <span className="text-[11px] font-bold text-text-1 tabular-nums ml-auto">
            @{leg.prop.price.toFixed(2)}
          </span>
        )}
      </div>

      {/* Reliability bar */}
      <div className="h-[2px] bg-border/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors.bar}`}
          style={{ width: `${Math.round(leg.reliability * 100)}%` }} />
      </div>
    </div>
  );
}

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
          <ValuePickCard key={i} leg={leg} />
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
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <p className="text-xs text-text-2">
              5 cooked slips + value picks · based on {maxGames > 0 ? `last ${maxGames} games` : "player history"}
            </p>
            <span className="text-text-2/40 text-xs">·</span>
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 text-[10px] text-text-2">
                <span className="text-[#22C55E] font-bold">▲</span> on form
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-2">
                <span className="text-[#F59E0B]">↺</span> bounce-back
              </span>
              <span className="flex items-center gap-1 text-[10px] text-text-2">
                <span className="text-primary">↑</span> threshold
              </span>
            </span>
          </div>
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
