"use client";

import { useState } from "react";
import type { NBAPlayerAnalyticsResult } from "@/lib/sports/nba/players/types";
import NBAPlayerProfileContent from "./NBAPlayerProfileContent";

interface NBAPlayerDrawerProps {
  data:       NBAPlayerAnalyticsResult;
  onClose:    () => void;
  teamEspnId?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export default function NBAPlayerDrawer({ data, onClose, teamEspnId }: NBAPlayerDrawerProps) {
  const { playerId, playerName, position, jersey, headshot, injuryContext, matchContext } = data;
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-[70] w-full sm:w-[88vw] lg:w-[80vw] max-w-[1120px] bg-[#0B0F1A] border-l border-[#3B82F6]/20 overflow-y-auto shadow-2xl transition-transform duration-300 translate-x-0 flex flex-col">

        {/* Header */}
        <div className="bg-[#111827] border-b border-[#3B82F6]/20 px-8 py-5 flex items-center gap-5 shrink-0">
          <div className="relative group shrink-0">
            {headshot && !imgFailed ? (
              <img
                src={headshot}
                alt={playerName}
                className="w-16 h-16 rounded-xl object-cover bg-white/5 border border-white/10 group-hover:border-[#3B82F6]/50 transition-colors"
                onError={() => setImgFailed(true)}
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
                {matchContext === "home" ? "Home" : "Away"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-[#6B7280] hover:text-white transition-all rounded-lg border border-white/5"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-7 custom-scrollbar">
          <NBAPlayerProfileContent data={data} />
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-[#111827] border-t border-white/5 flex items-center justify-between shrink-0">
          <div className="text-[9px] text-[#374151] font-mono">INTEL_VERSION: 1.0.0_NBA</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
            <span className="text-[9px] font-bold text-[#4B5563] uppercase tracking-widest">ESPN stats · current season</span>
          </div>
        </div>
      </div>
    </>
  );
}
