/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { KitchenSlip, KitchenLeg, KitchenSlipType } from "@/lib/sports/afl/kitchen";
import type { BoxScore } from "@/lib/types";
import {
  getConfidenceTier,
  CONFIDENCE_LABEL,
  CONFIDENCE_COLORS,
  CONFIDENCE_HEX,
} from "@/lib/sports/reliability/labels";
import { checkSlipHits, getLegCurrentValue } from "@/lib/sports/slipTracker";
import { BOOKIES, snapThreshold } from "@/lib/sports/afl/bookies";

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
    desc: "High-probability consistency plays. Threshold set well below average.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "Reliable picks with stronger returns. Slightly harder thresholds.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  goalscorers: {
    emoji: "🎯", title: "Goal Scorers",
    desc: "Best attacking trends. Goals only.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  disposals: {
    emoji: "📋", title: "Disposals Only",
    desc: "Volume-possession plays. Disposal legs only.",
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

function combinedProb(legs: KitchenLeg[]): number {
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
      className={`flex flex-col items-end gap-0.5 shrink-0 group cursor-pointer`}
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

function BreakdownTooltip({ leg, onClose }: { leg: KitchenLeg; onClose: () => void }) {
  const b    = leg.breakdown;
  const tier = getConfidenceTier(leg.reliability);
  const c    = CONFIDENCE_COLORS[tier];

  const rows: [string, string][] = [
    ["Weighted hit rate",       `${Math.round(b.weightedHitRate * 100)}%`],
    ["Consistency factor",      `×${b.consistencyFactor.toFixed(2)}`],
    [`Sample (${leg.gamesAnalyzed}g)`, `×${b.sampleFactor.toFixed(2)}`],
  ];
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

function LegRow({ leg, isHit, currentValue, onPlayerClick, bookie }: { leg: KitchenLeg; isHit?: boolean; currentValue?: number | null; onPlayerClick?: (name: string) => void; bookie?: "generic" | "bet365" | "dabble" }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const showBar = currentValue != null;
  const pct     = showBar ? Math.min((currentValue / leg.threshold) * 100, 100) : 0;
  const barColor = isHit ? "#22C55E" : "var(--color-primary, #F97316)";

  return (
    <div className={`py-2 border-b border-border last:border-0 transition-colors ${isHit ? "bg-[#22C55E]/5" : ""}`}>
      {/* Top row: player name + confidence badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 pt-0.5">
          {isHit && <span className="text-base leading-none shrink-0" title="Leg hit!">✅</span>}
          {!isHit && leg.isOnForm && (
            <span title="On form — last 3 games above season average"
              className="text-[#22C55E] text-[10px] shrink-0 leading-none font-black">▲</span>
          )}
          {!isHit && leg.isBounceBack && !leg.isOnForm && (
            <span title="Bounce-back candidate — below-average last game"
              className="text-[#F59E0B] text-xs shrink-0 leading-none">↺</span>
          )}
          <button
            onClick={() => onPlayerClick?.(leg.player)}
            className={`text-xs font-semibold truncate text-left hover:underline hover:text-primary transition-colors ${isHit ? "text-[#22C55E]" : "text-text-1"} ${onPlayerClick ? "cursor-pointer" : "cursor-default"}`}
          >{lastName(leg.player)}</button>
          <span className="text-[11px] text-text-2 shrink-0 font-medium">{leg.teamAbbr}</span>
        </div>
        <div className="relative shrink-0">
          <ConfidenceBadge reliability={leg.reliability} onClick={() => setShowBreakdown(v => !v)} />
          {showBreakdown && (
            <BreakdownTooltip leg={leg} onClose={() => setShowBreakdown(false)} />
          )}
        </div>
      </div>
      {/* Threshold + odds + bookie availability badges */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className={`text-[11px] font-semibold ${isHit ? "text-[#22C55E]" : "text-primary"}`}>
          ↑ {leg.threshold}+ {leg.statLabel}
        </span>
        {/* On All Markets tab: show B/D badges indicating which bookies support this leg */}
        {(!bookie || bookie === "generic") && (() => {
          const b365ok = BOOKIES.bet365.stats[leg.stat]?.available &&
            snapThreshold(leg.threshold, leg.stat, BOOKIES.bet365) !== null;
          const dabOk  = BOOKIES.dabble.stats[leg.stat]?.available &&
            snapThreshold(leg.threshold, leg.stat, BOOKIES.dabble) !== null;
          if (!b365ok && !dabOk) return null;
          return (
            <div className="flex gap-0.5 shrink-0">
              {b365ok && (
                <span className="text-[8px] bg-[#00A651]/20 text-[#00A651] px-1 py-0.5 rounded font-bold leading-none" title="Available on Bet365">B</span>
              )}
              {dabOk && (
                <span className="text-[8px] bg-[#FF6B35]/20 text-[#FF6B35] px-1 py-0.5 rounded font-bold leading-none" title="Available on Dabble">D</span>
              )}
            </div>
          );
        })()}
        {/* Price display.
            Safe slip: leg.threshold === leg.prop.line (exact Sportsbet line), always accurate.
            Other slips: kitchen computes its own threshold, show price only if the Sportsbet
            line is close enough (within 30% or 3 units) to avoid misleading prices. */}
        {(() => {
          if (!leg.prop) return null;
          const lineMatch = Math.abs(leg.prop.line - leg.threshold) <= Math.max(3, leg.threshold * 0.30);
          if (!lineMatch) return null;

          if (!bookie || bookie === "generic") {
            return (
              <span className="text-[11px] text-text-2 shrink-0 tabular-nums" title={`${leg.prop.bookmaker} price`}>
                @<span className="text-text-1 font-bold">{leg.prop.price.toFixed(2)}</span>
              </span>
            );
          }
          // bet365 / dabble — show Sportsbet price as market reference
          return (
            <span className="text-[11px] text-text-2 shrink-0 tabular-nums" title="Sportsbet market reference — check Bet365/Dabble app for exact price">
              @<span className="text-text-1 font-bold">{leg.prop.price.toFixed(2)}</span>
              <span className="text-[9px] text-text-2/50 ml-0.5">mkt ref</span>
            </span>
          );
        })()}
      </div>
      {/* Context */}
      <div className="text-[10px] text-text-2 mt-0.5 flex items-center gap-1.5">
        <span>avg {leg.avgStat} · {leg.gamesAnalyzed}g</span>
        {typeof leg.signalTotal === "number" && Math.abs(leg.signalTotal) >= 0.02 && (
          <span
            title={`Intelligence signals: ${leg.signalTotal > 0 ? "+" : ""}${Math.round(leg.signalTotal * 100)}% context boost`}
            className={`text-[9px] font-bold px-1 py-px rounded leading-none ${
              leg.signalTotal > 0
                ? "text-[#22C55E] bg-[#22C55E]/10"
                : "text-[#F59E0B] bg-[#F59E0B]/10"
            }`}
          >
            {leg.signalTotal > 0 ? "+" : ""}{Math.round(leg.signalTotal * 100)}%
          </span>
        )}
      </div>
      {/* Live progress bar with moving pill */}
      {showBar && (
        <div className="mt-3 relative h-[3px] bg-border/40 rounded-full" style={{ overflow: "visible" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: barColor }}
          />
          {/* Moving pill */}
          <div
            className="absolute -top-[11px] -translate-x-1/2 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none text-white transition-all duration-500 whitespace-nowrap"
            style={{ left: `${Math.max(pct, 6)}%`, backgroundColor: barColor }}
          >
            {currentValue}
          </div>
          {/* Threshold tick */}
          <div className="absolute right-0 -top-[3px] w-px h-[9px] rounded-full" style={{ backgroundColor: "rgba(150,150,150,0.35)" }} />
        </div>
      )}
    </div>
  );
}

// ─── Slip footer: combined hit chance ────────────────────────────────────────

function CombinedHitChance({ legs }: { legs: KitchenLeg[] }) {
  const [show, setShow] = useState(false);
  const prob = combinedProb(legs);
  const pct  = Math.round(prob * 100);
  const tier = getConfidenceTier(prob);
  const c    = CONFIDENCE_COLORS[tier];

  const allOdds   = legs.every(l => l.prop);
  const multiOdds = allOdds ? legs.reduce((acc, l) => acc * (l.prop!.price), 1) : null;

  return (
    <div className="flex items-center justify-between gap-3">
      {/* Left: hit chance label + tooltip */}
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

      {/* Right: pct + multi odds */}
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

function SlipCard({ slip, boxScore, onPlayerClick, bookie }: { slip: KitchenSlip; boxScore: BoxScore | null; onPlayerClick?: (name: string) => void; bookie?: "generic" | "bet365" | "dabble" }) {
  const cfg    = SLIP_CONFIG[slip.type];
  const hits   = slip.legs.length > 0 ? checkSlipHits(slip.legs, boxScore) : [];
  const allHit = hits.length > 0 && hits.every(Boolean);
  const someHit = hits.some(Boolean);
  const currentValues = boxScore
    ? slip.legs.map(leg => getLegCurrentValue(leg, boxScore))
    : slip.legs.map(() => null);

  return (
    <div className={`rounded-xl border ${allHit ? "border-[#22C55E]/40" : cfg.border} ${allHit ? "bg-[#22C55E]/5" : cfg.bg} flex flex-col`}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/50 rounded-t-xl">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-base leading-none">{cfg.emoji}</span>
            <span className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.title}</span>
            {someHit && !allHit && (
              <span className="text-[10px] text-[#22C55E] font-medium">
                {hits.filter(Boolean).length}/{hits.length} hit
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {allHit && (
              <span className="text-xl leading-none shake" title="All legs hit!">
                🫱🏼‍🫲🏻
              </span>
            )}
            <span className="text-[11px] text-text-2 font-medium">{slip.legs.length} leg{slip.legs.length !== 1 ? "s" : ""}</span>
          </div>
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
          slip.legs.map((leg, i) => <LegRow key={i} leg={leg} isHit={hits[i]} currentValue={currentValues[i]} onPlayerClick={onPlayerClick} bookie={bookie} />)
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

function ValuePickCard({ leg, index, isHit, onPlayerClick }: { leg: KitchenLeg; index: number; isHit?: boolean; onPlayerClick?: (name: string) => void }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const tier   = getConfidenceTier(leg.reliability);
  const colors = CONFIDENCE_COLORS[tier];
  const hex    = CONFIDENCE_HEX[tier];

  return (
    <div className={`p-3 rounded-xl border border-border/30 flex flex-col gap-2 ${isHit ? "bg-[#22C55E]/5 border-[#22C55E]/30" : "bg-surface/40"}`}>
      {/* Player header */}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {isHit && <span className="text-sm leading-none">✅</span>}
            {!isHit && leg.isOnForm && (
              <span title="On form" className="text-[#22C55E] text-[10px] font-black leading-none">▲</span>
            )}
            {!isHit && leg.isBounceBack && !leg.isOnForm && (
              <span title="Bounce-back candidate" className="text-[#F59E0B] text-xs leading-none">↺</span>
            )}
            <button
              onClick={() => onPlayerClick?.(leg.player)}
              className={`text-xs font-bold truncate text-left hover:underline hover:text-primary transition-colors ${isHit ? "text-[#22C55E]" : "text-text-1"} ${onPlayerClick ? "cursor-pointer" : "cursor-default"}`}
            >{lastName(leg.player)}</button>
            <span className="text-[11px] text-text-2 font-medium">{leg.teamAbbr}</span>
          </div>
        </div>
        {/* Confidence badge */}
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

      {/* Recommended bet — the actual pick */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[13px] font-black text-primary tabular-nums">
          ↑ {leg.threshold}+ {leg.statLabel}
        </span>
        {leg.prop && (
          <span className="text-[11px] font-bold text-text-1 tabular-nums shrink-0">
            @{leg.prop.price.toFixed(2)}
          </span>
        )}
      </div>

      {/* Avg → line context + games */}
      <div className="flex items-center gap-1 text-[10px] text-text-2">
        <span>avg {leg.avgStat}</span>
        <span className="opacity-40">·</span>
        <span>{leg.gamesAnalyzed}g</span>
        {leg.edge != null && (
          <>
            <span className="opacity-40">·</span>
            <span className={`font-bold ${colors.text}`}>+{leg.edge} edge</span>
          </>
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

function ValuePicks({ legs, boxScore, onPlayerClick }: { legs: KitchenLeg[]; boxScore: BoxScore | null; onPlayerClick?: (name: string) => void }) {
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-3">
        {legs.map((leg, i) => {
          const isHit = checkSlipHits([leg], boxScore)[0] ?? false;
          return <ValuePickCard key={i} leg={leg} index={i} isHit={isHit} onPlayerClick={onPlayerClick} />;
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AFLKitchen({ slips, boxScore, isUpcoming, onPlayerClick, bookie }: { slips: KitchenSlip[]; boxScore?: BoxScore | null; isUpcoming?: boolean; onPlayerClick?: (name: string) => void; bookie?: "generic" | "bet365" | "dabble" }) {
  const mainSlips = slips.filter(s => s.type !== "value");
  const valueSlip = slips.find(s => s.type === "value");
  const allLegs   = slips.flatMap(s => s.legs);
  const maxGames  = allLegs.length ? Math.max(...allLegs.map(l => l.gamesAnalyzed)) : 0;
  const bs        = boxScore ?? null;

  return (
    <div className="space-y-4 pb-4">

      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-2xl">🍳</span>
        <div className="flex-1 min-w-0">
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
        {isUpcoming && (
          <a
            href="/betslip"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all
              bg-primary/10 border border-primary/40 text-primary hover:bg-primary hover:text-white hover:border-primary"
          >
            🔍 Slip Checker
          </a>
        )}
      </div>

      {/* 5 main slips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {mainSlips.map(slip => (
          <SlipCard key={slip.type} slip={slip} boxScore={bs} onPlayerClick={onPlayerClick} bookie={bookie} />
        ))}
      </div>

      {/* Value picks */}
      {valueSlip && <ValuePicks legs={valueSlip.legs} boxScore={bs} onPlayerClick={onPlayerClick} />}

    </div>
  );
}
