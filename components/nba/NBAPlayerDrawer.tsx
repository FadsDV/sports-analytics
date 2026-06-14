"use client";

import { useState } from "react";
import type { NBAPlayerAnalyticsResult } from "@/lib/sports/nba/players/types";
import NBAPlayerProfileContent from "./NBAPlayerProfileContent";

interface NBAPlayerDrawerProps {
  data:    NBAPlayerAnalyticsResult;
  onClose: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export default function NBAPlayerDrawer({ data, onClose }: NBAPlayerDrawerProps) {
  const { playerName, position, jersey, headshot, seasonAvg, games, seasonsIncluded } = data;
  const [imgFailed, setImgFailed] = useState(false);

  const totalGames = games.filter(g => g.seasonType !== "preseason").length;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/85 z-[60] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — wide: 80vw desktop, full mobile */}
      <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-[80vw] min-w-[320px] bg-[#0B0F1A] border-l border-[#3B82F6]/20 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="bg-[#111827] border-b border-[#3B82F6]/20 px-6 py-5 flex items-center gap-5 shrink-0">

          {/* Headshot */}
          <div className="relative shrink-0">
            {headshot && !imgFailed ? (
              <img
                src={headshot}
                alt={playerName}
                className="w-16 h-16 rounded-xl object-cover bg-white/5 border border-white/10"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#1F2937] flex items-center justify-center text-xl font-black text-[#9CA3AF] border border-white/10">
                {initials(playerName)}
              </div>
            )}
            {jersey && (
              <div className="absolute -bottom-1 -right-1 bg-[#3B82F6] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-[#0B0F1A]">
                #{jersey}
              </div>
            )}
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-white tracking-tight truncate uppercase mb-1">
              {playerName}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-widest">{position}</span>
              <span className="w-1 h-1 rounded-full bg-[#374151]" />
              <span className="text-[11px] text-[#6B7280]">
                {seasonAvg.gamesCount}G this season · {totalGames} tracked
              </span>
              {seasonsIncluded.length > 0 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-[#374151]" />
                  <span className="text-[11px] text-[#4B5563] font-mono">
                    {seasonsIncluded.map(s => `'${String(s).slice(-2)}`).join(", ")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick stats bar */}
          <div className="hidden lg:flex items-center gap-5 mr-4 shrink-0">
            {[
              { label: "PTS", value: seasonAvg.points.toFixed(1) },
              { label: "REB", value: seasonAvg.rebounds.toFixed(1) },
              { label: "AST", value: seasonAvg.assists.toFixed(1) },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="text-base font-black text-white tabular-nums">{s.value}</div>
                <div className="text-[9px] text-[#4B5563] uppercase tracking-widest font-bold">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-[#6B7280] hover:text-white transition-all rounded-lg border border-white/5 shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <NBAPlayerProfileContent data={data} />
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#111827] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="text-[9px] text-[#374151] font-mono">INTEL_VERSION: 1.0.0_NBA</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest">ESPN data active</span>
          </div>
        </div>
      </div>
    </>
  );
}
