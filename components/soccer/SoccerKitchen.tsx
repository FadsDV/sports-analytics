"use client";

import { useState } from "react";
import type { SoccerKitchenSlip, SoccerKitchenLeg, SoccerSlipType } from "@/lib/sports/soccer/kitchen";
import {
  getConfidenceTier,
  CONFIDENCE_LABEL,
  CONFIDENCE_COLORS,
  CONFIDENCE_HEX,
} from "@/lib/sports/reliability/labels";

// ─── Slip display config ──────────────────────────────────────────────────────

const SLIP_CONFIG: Record<SoccerSlipType, {
  emoji: string; title: string; desc: string;
  color: string; border: string; bg: string;
}> = {
  safe: {
    emoji: "🛡️", title: "Safe",
    desc: "High-probability match & team plays. Thresholds set well below average.",
    color: "text-[#22C55E]", border: "border-[#22C55E]/25", bg: "bg-[#22C55E]/5",
  },
  doable: {
    emoji: "✅", title: "Doable",
    desc: "Reliable player picks with solid returns. 60–78% hit rate.",
    color: "text-[#60A5FA]", border: "border-[#60A5FA]/25", bg: "bg-[#60A5FA]/5",
  },
  goalscorers: {
    emoji: "⚽", title: "Goal Scorers",
    desc: "Best goal-scoring trends this season. Goals only.",
    color: "text-[#F97316]", border: "border-[#F97316]/25", bg: "bg-[#F97316]/5",
  },
  shots: {
    emoji: "🏹", title: "Shots",
    desc: "Player Shots and Shots on Target props.",
    color: "text-[#A78BFA]", border: "border-[#A78BFA]/25", bg: "bg-[#A78BFA]/5",
  },
  cards: {
    emoji: "🟨", title: "Cards",
    desc: "Yellow card legs for players and match totals.",
    color: "text-[#EF4444]", border: "border-[#EF4444]/25", bg: "bg-[#EF4444]/5",
  },
  value: {
    emoji: "💰", title: "Value Picks",
    desc: "Best edge picks — average well above threshold. Highest edge-to-threshold ratio.",
    color: "text-[#F59E0B]", border: "border-[#F59E0B]/25", bg: "bg-[#F59E0B]/5",
  },
};

const STAT_ICONS: Record<string, string> = {
  goals: "⚽", assists: "🎯", scoreOrAssist: "⚽🎯",
  shots: "🏹", shotsOnTarget: "🎯",
  keyPasses: "🔑", yellowCards: "🟨", xG: "📊",
  tackles: "💪", foulsCommitted: "🟥", saves: "🧤",
  teamGoals: "⚽", matchGoals: "📊", btts: "🔄",
  totalCards: "🟨", teamCards: "🟨", corners: "📐",
};

// ─── Breakdown tooltip ────────────────────────────────────────────────────────

function BreakdownTooltip({ leg, onClose }: { leg: SoccerKitchenLeg; onClose: () => void }) {
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
            <span className={`text-[10px] font-black uppercase tracking-wider ${c.text}`}>{CONFIDENCE_LABEL[tier]}</span>
            <span className={`text-xs font-bold tabular-nums ${c.text}`}>{Math.round(leg.reliability * 100)}%</span>
          </div>
          <div className="h-[3px] bg-border/40 rounded-full overflow-hidden mt-1.5">
            <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.round(leg.reliability * 100)}%` }} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Leg row ──────────────────────────────────────────────────────────────────

function LegRow({ leg, onPlayerClick }: { leg: SoccerKitchenLeg; onPlayerClick?: (name: string) => void }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const tier   = getConfidenceTier(leg.reliability);
  const c      = CONFIDENCE_COLORS[tier];
  const pct    = Math.round(leg.reliability * 100);
  const icon   = STAT_ICONS[leg.stat] ?? "📊";

  const isTeam = leg.legType === "team" || leg.legType === "match";

  return (
    <div className="py-2.5 border-b border-border/30 last:border-0">
      {/* Top row: name + confidence */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 pt-0.5">
          {leg.isOnForm && !isTeam && (
            <span title="On form — last 3 games above season average"
              className="text-[#22C55E] text-[10px] shrink-0 leading-none font-black">▲</span>
          )}
          {leg.isBounceBack && !leg.isOnForm && !isTeam && (
            <span title="Bounce-back candidate" className="text-[#F59E0B] text-xs shrink-0 leading-none">↺</span>
          )}
          <button
            onClick={() => !isTeam && onPlayerClick?.(leg.player ?? "")}
            className={`text-xs font-semibold text-text-1 truncate text-left ${!isTeam ? "hover:underline hover:text-primary transition-colors cursor-pointer" : "cursor-default"}`}
          >
            {isTeam
              ? (leg.teamName ?? leg.teamAbbr ?? "Match")
              : (leg.shortName ?? leg.player ?? "")}
          </button>
          {!isTeam && leg.teamAbbr && (
            <span className="text-[10px] text-text-2 shrink-0">{leg.teamAbbr}</span>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className="flex flex-col items-end gap-0.5 group"
            title="Click for breakdown"
          >
            <span className={`text-[10px] font-black uppercase tracking-wider ${c.text} group-hover:opacity-75`}>{CONFIDENCE_LABEL[tier]}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-12 h-[3px] bg-border/40 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <span className={`text-[10px] tabular-nums font-bold ${c.text}`}>{pct}%</span>
            </div>
          </button>
          {showBreakdown && <BreakdownTooltip leg={leg} onClose={() => setShowBreakdown(false)} />}
        </div>
      </div>

      {/* Threshold line */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px] font-semibold text-primary">
          {icon} {leg.direction === "over" ? "↑" : "↓"} {leg.threshold}+ {leg.statLabel}
        </span>
        <span className="text-[10px] text-text-2 shrink-0">
          {Math.round(leg.hitRate * 100)}% hit rate
        </span>
      </div>

      {/* Context */}
      <div className="text-[10px] text-text-2 mt-0.5 flex items-center gap-1.5">
        {!isTeam && leg.avgStat != null && <span>avg {leg.avgStat} · </span>}
        <span>{leg.gamesAnalyzed}g analyzed</span>
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
    </div>
  );
}

// ─── Combined prob footer ─────────────────────────────────────────────────────

function CombinedHitChance({ legs }: { legs: SoccerKitchenLeg[] }) {
  const [show, setShow] = useState(false);
  const prob = legs.reduce((acc, l) => acc * l.reliability, 1);
  const pct  = Math.round(prob * 100);
  const tier = getConfidenceTier(prob);
  const c    = CONFIDENCE_COLORS[tier];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="relative">
        <button
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
          className="flex items-center gap-1 text-[11px] text-text-2 hover:text-text-1 transition-colors"
        >
          Hit chance
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-2/40 text-[9px] text-text-2/60">?</span>
        </button>
        {show && (
          <div className="absolute z-[100] bottom-full mb-2 left-0 w-60 bg-bg-2 border border-border rounded-lg shadow-xl p-2.5 text-[11px]">
            <p className="text-text-1 font-semibold mb-1">Combined hit probability</p>
            <p className="text-text-2 leading-snug">Each leg&apos;s reliability multiplied together — estimated chance all legs hit.</p>
          </div>
        )}
      </div>
      <span className={`text-xs font-bold tabular-nums ${c.text}`}>~{pct}%</span>
    </div>
  );
}

// ─── Slip card ────────────────────────────────────────────────────────────────

function SlipCard({ slip, onPlayerClick }: { slip: SoccerKitchenSlip; onPlayerClick?: (name: string) => void }) {
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
          slip.legs.map((leg, i) => <LegRow key={i} leg={leg} onPlayerClick={onPlayerClick} />)
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

// ─── Value picks ──────────────────────────────────────────────────────────────

function ValuePickCard({ leg, onPlayerClick }: { leg: SoccerKitchenLeg; onPlayerClick?: (name: string) => void }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const tier   = getConfidenceTier(leg.reliability);
  const c      = CONFIDENCE_COLORS[tier];
  const icon   = STAT_ICONS[leg.stat] ?? "📊";

  return (
    <div className="p-3 border-b border-r border-border/30 last:border-r-0 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {leg.isOnForm && <span className="text-[#22C55E] text-[10px] font-black">▲</span>}
            {leg.isBounceBack && !leg.isOnForm && <span className="text-[#F59E0B] text-xs">↺</span>}
            <button
              onClick={() => leg.legType === "player" && onPlayerClick?.(leg.player ?? "")}
              className={`text-xs font-bold text-text-1 truncate text-left ${leg.legType === "player" ? "hover:underline hover:text-primary transition-colors cursor-pointer" : "cursor-default"}`}
            >
              {leg.legType === "player" ? (leg.shortName ?? leg.player) : (leg.teamName ?? "Match")}
            </button>
            {leg.teamAbbr && leg.legType === "player" && (
              <span className="text-[10px] text-text-2">{leg.teamAbbr}</span>
            )}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className={`text-[10px] font-black uppercase tracking-wide ${c.text} hover:opacity-75 transition-opacity`}
          >
            {CONFIDENCE_LABEL[tier]}
          </button>
          {showBreakdown && <BreakdownTooltip leg={leg} onClose={() => setShowBreakdown(false)} />}
        </div>
      </div>

      <div className="text-[10px] text-text-2">{icon} {leg.statLabel} · {leg.gamesAnalyzed}g</div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-text-2">avg</span>
        <span className="text-sm font-bold text-text-1 tabular-nums">{leg.avgStat}</span>
        <span className="text-[10px] text-text-2/50">→</span>
        <span className="text-sm font-bold text-text-1 tabular-nums">{leg.threshold}</span>
        <span className="text-[11px] text-text-2">line</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        {leg.edge != null && (
          <span className={`text-xs font-black tabular-nums px-1.5 py-0.5 rounded ${c.text}`}
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid currentColor` }}>
            +{leg.edge} edge
          </span>
        )}
        {typeof leg.signalTotal === "number" && Math.abs(leg.signalTotal) >= 0.02 && (
          <span className={`text-[9px] font-bold ${leg.signalTotal > 0 ? "text-[#22C55E]" : "text-[#F59E0B]"}`}>
            {leg.signalTotal > 0 ? "+" : ""}{Math.round(leg.signalTotal * 100)}%
          </span>
        )}
      </div>

      <div className="h-[2px] bg-border/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.round(leg.reliability * 100)}%` }} />
      </div>
    </div>
  );
}

function ValuePicks({ legs, onPlayerClick }: { legs: SoccerKitchenLeg[]; onPlayerClick?: (name: string) => void }) {
  const cfg = SLIP_CONFIG.value;
  if (!legs.length) return null;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {legs.map((leg, i) => <ValuePickCard key={i} leg={leg} onPlayerClick={onPlayerClick} />)}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SoccerKitchen({ slips, onPlayerClick }: { slips: SoccerKitchenSlip[]; onPlayerClick?: (name: string) => void }) {
  const mainSlips = slips.filter(s => s.type !== "value");
  const valueSlip = slips.find(s => s.type === "value");
  const allLegs   = slips.flatMap(s => s.legs);
  const maxGames  = allLegs.length ? Math.max(...allLegs.map(l => l.gamesAnalyzed)) : 0;

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-2xl">🍳</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-text-1 tracking-wide">The Kitchen</h2>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <p className="text-xs text-text-2">
              5 cooked slips + value picks · based on {maxGames > 0 ? `last ${maxGames} games` : "season history"}
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
        <a
          href="/betslip"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all
            bg-primary/10 border border-primary/40 text-primary hover:bg-primary hover:text-white hover:border-primary"
        >
          🔍 Slip Checker
        </a>
      </div>

      {/* 5 main slips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {mainSlips.map(slip => <SlipCard key={slip.type} slip={slip} onPlayerClick={onPlayerClick} />)}
      </div>

      {/* Value picks */}
      {valueSlip && <ValuePicks legs={valueSlip.legs} onPlayerClick={onPlayerClick} />}
    </div>
  );
}
