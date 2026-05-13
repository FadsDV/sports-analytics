"use client";

import { useState } from "react";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { NBAPlayerAnalyticsResult } from "@/lib/sports/nba/players/types";
import PlayerAvatar from "@/components/afl/PlayerAvatar";
import NBAPlayerDrawer from "./NBAPlayerDrawer";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NBAPlayerListProps {
  players:      ESPNPlayer[];
  injuries:     ESPNInjury[];
  teamName:     string;
  teamLogo?:    string;
  teamEspnId?:  string;
  matchContext: "home" | "away";
  opponent:     string;
}

// ── Position grouping ─────────────────────────────────────────────────────────

type PositionGroup = "Guards" | "Forwards" | "Centers" | "Others";

const GUARD_POS   = new Set(["PG", "SG", "G", "G-F"]);
const FORWARD_POS = new Set(["SF", "PF", "F", "F-C", "F-G"]);
const CENTER_POS  = new Set(["C"]);

function positionGroup(pos: string): PositionGroup {
  const p = pos.toUpperCase();
  if (GUARD_POS.has(p))   return "Guards";
  if (FORWARD_POS.has(p)) return "Forwards";
  if (CENTER_POS.has(p))  return "Centers";
  return "Others";
}

const GROUP_ORDER: PositionGroup[] = ["Guards", "Forwards", "Centers", "Others"];

// ── Injury status ─────────────────────────────────────────────────────────────

const INJURY_CLS: Record<string, string> = {
  Out:          "text-[#EF4444] bg-[#EF4444]/10",
  Doubtful:     "text-[#F97316] bg-[#F97316]/10",
  Questionable: "text-[#F59E0B] bg-[#F59E0B]/10",
  Probable:     "text-[#3B82F6] bg-[#3B82F6]/10",
  Suspended:    "text-[#A855F7] bg-[#A855F7]/10",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NBAPlayerList({
  players,
  injuries,
  teamName,
  teamLogo,
  teamEspnId,
  matchContext,
  opponent,
}: NBAPlayerListProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<ESPNPlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<NBAPlayerAnalyticsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openDrawer(player: ESPNPlayer) {
    if (!player.id) return;
    setSelectedPlayer(player);
    setLoading(true);
    setDrawerData(null);
    setError(null);
    try {
      const url =
        `/api/nba/player/${player.id}` +
        `?homeAway=${matchContext}` +
        `&opponent=${encodeURIComponent(opponent)}` +
        `&teamId=${encodeURIComponent(teamEspnId ?? "")}` +
        `&name=${encodeURIComponent(player.displayName)}` +
        `&position=${encodeURIComponent(player.position)}` +
        `&jersey=${encodeURIComponent(player.jersey ?? "")}` +
        `&headshot=${encodeURIComponent(player.headshot ?? "")}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError("Could not load player data.");
        setLoading(false);
        return;
      }
      const data: NBAPlayerAnalyticsResult = await res.json();
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

  if (players.length === 0) {
    return (
      <p className="text-xs text-[#374151] py-2">
        Roster data unavailable for this team.
      </p>
    );
  }

  // Injury lookup
  const injuryById   = new Map<string, ESPNInjury>();
  const injuryByName = new Map<string, ESPNInjury>();
  for (const inj of injuries) {
    if (inj.playerId) injuryById.set(inj.playerId, inj);
    injuryByName.set(inj.playerName.toLowerCase(), inj);
  }
  const getInjury = (p: ESPNPlayer) =>
    injuryById.get(p.id) ?? injuryByName.get(p.displayName.toLowerCase());

  // Group players by position
  const groups = new Map<PositionGroup, ESPNPlayer[]>();
  for (const p of players) {
    const g = positionGroup(p.position);
    const bucket = groups.get(g) ?? [];
    bucket.push(p);
    groups.set(g, bucket);
  }

  const contextLabel = matchContext === "home" ? "HOME" : "AWAY";

  return (
    <div className="min-w-0">
      {/* Team header */}
      <div className="flex items-center gap-1.5 mb-2.5">
        {teamLogo && (
          <img src={teamLogo} alt="" className="w-3.5 h-3.5 object-contain" />
        )}
        <span className="text-[10px] font-bold text-[#4B5563] truncate uppercase tracking-widest">
          {teamName}
        </span>
        <span className="ml-auto text-[9px] font-black text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-px rounded uppercase tracking-tighter">
          {contextLabel} ROSTER
        </span>
      </div>

      {/* Position groups */}
      <div className="space-y-3">
        {GROUP_ORDER.map(groupLabel => {
          const groupPlayers = groups.get(groupLabel);
          if (!groupPlayers?.length) return null;
          return (
            <div key={groupLabel}>
              <div className="text-[9px] font-semibold uppercase tracking-widest text-[#374151] mb-1 px-1">
                {groupLabel}
              </div>
              <div className="space-y-0.5">
                {groupPlayers.map(player => {
                  const injury = getInjury(player);
                  const injCls = injury?.status ? (INJURY_CLS[injury.status] ?? INJURY_CLS.Questionable) : null;
                  const isOut  = injury?.status === "Out";

                  return (
                    <div
                      key={player.id}
                      className="flex items-center border-b border-white/[0.03] last:border-0 hover:bg-white/[0.04] rounded transition-all group"
                    >
                      {/* Click area: opens drawer */}
                      <button
                        onClick={() => openDrawer(player)}
                        className="flex items-center gap-2 py-1.5 flex-1 min-w-0 px-1 text-left"
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
                        <span className={`flex-1 truncate text-xs transition-colors ${
                          isOut
                            ? "text-[#374151] line-through"
                            : "text-[#E5E7EB] group-hover:text-white group-hover:font-medium"
                        }`}>
                          {player.displayName}
                        </span>

                        {/* Injury badge */}
                        {injCls && injury?.status && (
                          <span className={`text-[9px] font-bold px-1.5 py-px rounded shrink-0 ${injCls}`}>
                            {injury.status === "Questionable" ? "GTD" : injury.status}
                          </span>
                        )}

                        {/* Position badge */}
                        <span className="text-[9px] font-bold text-[#4B5563] bg-white/[0.04] px-1.5 py-px rounded shrink-0 uppercase tracking-tighter">
                          {player.position}
                        </span>
                      </button>

                      {/* Quick-preview icon */}
                      <button
                        onClick={() => openDrawer(player)}
                        title="Player intel"
                        className="opacity-0 group-hover:opacity-100 transition-all shrink-0 w-6 h-6 mr-1 flex items-center justify-center bg-white/[0.04] hover:bg-[#3B82F6]/20 text-[#4B5563] hover:text-[#3B82F6] rounded"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
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
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
          {drawerData && !loading && (
            <NBAPlayerDrawer data={drawerData} onClose={handleClose} teamEspnId={teamEspnId} />
          )}
        </>
      )}
    </div>
  );
}
