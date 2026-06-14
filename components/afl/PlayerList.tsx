"use client";

import { useState } from "react";
import type { ESPNPlayer } from "@/lib/sports/espnPlayers";
import type { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";
import PlayerDrawer from "./PlayerDrawer";
import PlayerAvatar from "./PlayerAvatar";

interface PlayerListProps {
  players: ESPNPlayer[];
  teamName: string;
  teamLogo?: string;
  teamEspnId: string;
  matchContext: "home" | "away";
  opponent: string;
}

export default function PlayerList({
  players,
  teamName,
  teamLogo,
  teamEspnId,
  matchContext,
  opponent,
}: PlayerListProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<ESPNPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<AFLPlayerAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextLabel = matchContext === "home" ? "HOME" : "AWAY";

  function playerProfileUrl(player: ESPNPlayer): string {
    return `/player/afl/${player.id}?teamId=${teamEspnId}&homeAway=${matchContext}&opponent=${encodeURIComponent(opponent)}`;
  }

  async function openDrawer(player: ESPNPlayer) {
    setSelectedPlayer(player);
    setLoading(true);
    setDrawerData(null);
    setError(null);

    try {
      // Pass the roster-derived headshot (champId-based AFL CDN URL) as a hint so the
      // analytics API can use it as the primary source rather than re-deriving from ESPN,
      // which has patchy AFL player coverage.
      const url = `/api/afl/player/${player.id}?homeAway=${matchContext}&opponent=${encodeURIComponent(opponent)}&teamId=${encodeURIComponent(teamEspnId)}&name=${encodeURIComponent(player.displayName)}&position=${encodeURIComponent(player.position)}&jersey=${encodeURIComponent(player.jersey ?? "")}&headshot=${encodeURIComponent(player.headshot ?? "")}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError("Could not load player data.");
        setLoading(false);
        return;
      }
      const data: AFLPlayerAnalyticsResult = await res.json();
      setDrawerData(data);
    } catch {
      setError("Failed to fetch player analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedPlayer(null);
    setDrawerData(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div className="min-w-0">
      {/* Team header */}
      <div className="flex items-center gap-1.5 mb-2.5">
        {teamLogo && (
          <img src={teamLogo} alt="" className="w-3.5 h-3.5 object-contain" />
        )}
        <span className="text-[10px] font-bold text-[#4B5563] truncate uppercase tracking-widest">{teamName}</span>
        <span className="ml-auto text-[9px] font-black text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-px rounded uppercase tracking-tighter">
          {contextLabel} INTEL
        </span>
      </div>

      {/* Player rows */}
      <div className="space-y-0.5">
        {players.map((player) => (
          // Outer div: hover target + flex row container
          <div
            key={player.id}
            className="flex items-center border-b border-white/[0.03] last:border-0 hover:bg-white/[0.04] rounded transition-all group"
          >
            {/* Main link — left-click navigates; middle/cmd+click opens new tab */}
            <a
              href={playerProfileUrl(player)}
              className="flex items-center gap-2 py-1.5 flex-1 min-w-0 px-1"
            >
              {/* Jersey */}
              <span className="text-[#4B5563] w-5 text-center font-mono text-[10px] shrink-0 font-bold">
                {player.jersey || "—"}
              </span>

              {/* Headshot / initials */}
              <PlayerAvatar
                src={player.headshot}
                name={player.displayName}
                size={24}
              />

              {/* Name */}
              <span className="text-[#E5E7EB] flex-1 truncate text-xs group-hover:text-white group-hover:font-medium transition-colors">
                {player.displayName}
              </span>

              {/* Position badge */}
              <span className="text-[9px] font-bold text-[#4B5563] bg-white/[0.04] px-1.5 py-px rounded shrink-0 uppercase tracking-tighter">
                {player.position}
              </span>
            </a>

            {/* Quick-preview button — shows on hover, opens drawer without navigating */}
            <button
              onClick={() => openDrawer(player)}
              title="Quick preview"
              className="opacity-0 group-hover:opacity-100 transition-all shrink-0 w-6 h-6 mr-1 flex items-center justify-center bg-white/[0.04] hover:bg-[#3B82F6]/20 text-[#4B5563] hover:text-[#3B82F6] rounded"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Drawer */}
      {selectedPlayer && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-[10px] font-black text-[#6B7280] uppercase tracking-widest">
                    SYNCING INTEL: {selectedPlayer.displayName}
                  </p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60]" onClick={handleClose} />
              <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-xl bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center">
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4 uppercase tracking-tight">{error}</p>
                  <button
                    onClick={handleClose}
                    className="text-xs font-black text-[#6B7280] hover:text-white underline uppercase tracking-widest"
                  >
                    Close Link
                  </button>
                </div>
              </div>
            </>
          )}
          {drawerData && !loading && (
            <PlayerDrawer data={drawerData} onClose={handleClose} teamEspnId={teamEspnId} />
          )}
        </>
      )}
    </div>
  );
}
