"use client";

import { useState } from "react";
import Link from "next/link";
import type { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";
import PlayerProfileContent from "./PlayerProfileContent";
import { computeReliability, tierColors, tierLabel } from "@/utils/statAnalyzer";

interface PlayerDrawerProps {
  data: AFLPlayerAnalyticsResult;
  onClose: () => void;
  teamEspnId?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function BetChecker({ data }: { data: AFLPlayerAnalyticsResult }) {
  const { last5Context, seasonAvg } = data;
  if (!last5Context.length || !seasonAvg) return null;

  const games = last5Context.map(g => ({
    value: g.disposals ?? 0,
    homeAway: g.homeAway,
  }));

  const dispAvg = Math.round(seasonAvg.disposals);
  const goalAvg = seasonAvg.goals;
  const dispRel = computeReliability(games, dispAvg);

  const goalGames = last5Context.map(g => ({ value: g.goals ?? 0, homeAway: g.homeAway }));
  const goalThreshold = goalAvg >= 1 ? Math.max(1, Math.round(goalAvg)) : 1;
  const goalRel = computeReliability(goalGames, goalThreshold);

  const trendIcon = (t: "up" | "flat" | "down") =>
    t === "up" ? "↑" : t === "down" ? "↓" : "→";

  const dc = tierColors(dispRel.tier);
  const gc = tierColors(goalRel.tier);

  return (
    <div className="px-6 py-4 border-b border-white/5 bg-[#0d1421]">
      <div className="text-[9px] font-black uppercase tracking-[0.15em] text-[#374151] mb-3">
        Bet Checker · Last {dispRel.gamesUsed} Games
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Disposals reliability */}
        <div className={`rounded-xl p-3 border ${dc.border} ${dc.bg}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#6B7280] font-medium">Disposals ≥{dispAvg}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${dc.bg} ${dc.text}`}>
              {tierLabel(dispRel.tier)}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tabular-nums ${dc.text}`}>
              {Math.round(dispRel.hitRate * 100)}%
            </span>
            <span className="text-[10px] text-[#6B7280]">hit rate</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[9px] text-[#4B5563]">
            <span>{dispRel.hitsInWindow}/{dispRel.gamesUsed} games</span>
            <span>·</span>
            <span className={dispRel.trend === "up" ? "text-[#22C55E]" : dispRel.trend === "down" ? "text-[#EF4444]" : "text-[#9CA3AF]"}>
              {trendIcon(dispRel.trend)} trend
            </span>
            <span>·</span>
            <span>avg {dispRel.avg.toFixed(1)}</span>
          </div>
          {Math.abs(dispRel.homeEdge) > 1.5 && (
            <div className="mt-1.5 text-[9px] text-[#F59E0B]">
              {dispRel.homeEdge > 0 ? "↑ Better at home" : "↑ Better away"}
              {" "}(Δ{Math.abs(dispRel.homeEdge).toFixed(1)})
            </div>
          )}
        </div>

        {/* Goals reliability */}
        <div className={`rounded-xl p-3 border ${gc.border} ${gc.bg}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#6B7280] font-medium">Goals ≥{goalThreshold}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${gc.bg} ${gc.text}`}>
              {tierLabel(goalRel.tier)}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl font-black tabular-nums ${gc.text}`}>
              {Math.round(goalRel.hitRate * 100)}%
            </span>
            <span className="text-[10px] text-[#6B7280]">hit rate</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[9px] text-[#4B5563]">
            <span>{goalRel.hitsInWindow}/{goalRel.gamesUsed} games</span>
            <span>·</span>
            <span className={goalRel.trend === "up" ? "text-[#22C55E]" : goalRel.trend === "down" ? "text-[#EF4444]" : "text-[#9CA3AF]"}>
              {trendIcon(goalRel.trend)} trend
            </span>
            <span>·</span>
            <span>avg {goalRel.avg.toFixed(1)}</span>
          </div>
        </div>
      </div>
      {/* Confidence bar */}
      <div className="mt-3">
        <div className="flex justify-between text-[9px] text-[#374151] mb-1">
          <span>Disposals confidence</span>
          <span className={dc.text}>{Math.round(dispRel.confidence * 100)}%</span>
        </div>
        <div className="h-[3px] bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${
            dispRel.tier === "strong" ? "bg-[#22C55E]" :
            dispRel.tier === "moderate" ? "bg-[#F59E0B]" : "bg-[#EF4444]"
          }`} style={{ width: `${Math.round(dispRel.confidence * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function PlayerDrawer({ data, onClose, teamEspnId }: PlayerDrawerProps) {
  const { playerName, position, jersey, headshot, injuryContext, matchContext, opponent, playerId } = data;
  // Track per-render image failures so we can fall back to initials gracefully.
  // Resets automatically when `data` changes (new player opened).
  const [imgFailed, setImgFailed] = useState(false);

  const profileHref = teamEspnId
    ? `/player/afl/${playerId}?teamId=${teamEspnId}&homeAway=${matchContext}&opponent=${encodeURIComponent(opponent)}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-2xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 overflow-y-auto shadow-2xl transition-transform duration-300 translate-x-0 flex flex-col">

        {/* Header */}
        <div className="bg-[#111827] border-b border-[#3B82F6]/20 px-6 py-5 flex items-center gap-5 shrink-0">
          <div className="relative group shrink-0">
            {/* AFL CDN headshot. onError falls back to initials — same source as PlayerList rows. */}
            {headshot && !imgFailed ? (
              <img
                src={headshot}
                alt={playerName}
                className="w-16 h-16 rounded-xl object-cover bg-white/5 border border-white/10 group-hover:border-[#3B82F6]/50 transition-colors"
                onError={() => {
                  console.warn(`[SportsPulse] PlayerDrawer headshot failed: ${playerName} (${headshot})`);
                  setImgFailed(true);
                }}
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#1F2937] flex items-center justify-center text-xl font-black text-[#9CA3AF] border border-white/10 group-hover:border-[#3B82F6]/50 transition-colors">
                {initials(playerName)}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-[#3B82F6] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-[#0B0F1A]">
              #{jersey || "—"}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-black text-white tracking-tight truncate uppercase">{playerName}</h2>
              {injuryContext && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                  injuryContext.status === "Out"
                    ? "bg-red-900/40 text-red-400 border-red-800/60"
                    : "bg-yellow-900/40 text-yellow-400 border-yellow-800/60"
                }`}>
                  {injuryContext.status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-widest">{position}</span>
              <span className="w-1 h-1 rounded-full bg-[#374151]" />
              <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-widest">
                Expected Role: <span className="text-[#D1D5DB]">{position}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {profileHref && (
              <Link
                href={profileHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Open full profile in new tab"
                className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-[#3B82F6]/20 text-[#6B7280] hover:text-[#3B82F6] transition-all rounded-lg border border-white/5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15,3 21,3 21,9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </Link>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-[#6B7280] hover:text-white transition-all rounded-lg border border-white/5"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Bet Checker */}
        <BetChecker data={data} />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <PlayerProfileContent data={data} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#111827] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="text-[9px] text-[#374151] font-mono">INTEL_VERSION: 1.0.42_AFL</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest">Real-time stats active</span>
          </div>
        </div>
      </div>
    </>
  );
}
