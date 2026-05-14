"use client";

import { useState } from "react";
import Link from "next/link";
import { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import { Sport } from "@/lib/types";
import PlayerDrawer from "./afl/PlayerDrawer";
import PlayerAvatar from "./afl/PlayerAvatar";
import { AFLPlayerAnalyticsResult } from "@/lib/sports/afl/players/types";
import NBAPlayerDrawer from "./nba/NBAPlayerDrawer";
import type { NBAPlayerAnalyticsResult } from "@/lib/sports/nba/players/types";

// ─── Injury badge colours ───────────────────────────────────────────────────

const INJURY_COLORS: Record<string, string> = {
  Out:          "bg-red-900/50 text-red-400 border-red-800/60",
  Doubtful:     "bg-orange-900/50 text-orange-400 border-orange-800/60",
  Questionable: "bg-yellow-900/50 text-yellow-400 border-yellow-800/60",
  Probable:     "bg-blue-900/40 text-blue-400 border-blue-800/50",
  Suspended:    "bg-purple-900/50 text-purple-400 border-purple-800/60",
};

// ─── Position grouping (per sport) ─────────────────────────────────────────

function positionRank(sport: Sport, pos: string): number {
  const p = pos.toUpperCase();

  if (sport === "basketball") {
    if (["PG", "SG", "G"].includes(p))  return 0;
    if (p === "SF")                       return 1;
    if (p === "PF")                       return 2;
    if (p === "C")                        return 3;
    return 4;
  }

  if (sport === "nfl") {
    if (p === "QB")                                     return 0;
    if (["RB", "FB", "HB"].includes(p))                return 1;
    if (["WR", "TE"].includes(p))                      return 2;
    if (["OT", "OG", "OC", "OL", "C"].includes(p))   return 3;
    if (["DE", "DT", "NT", "DL"].includes(p))          return 4;
    if (["LB", "ILB", "OLB", "MLB"].includes(p))       return 5;
    if (["CB", "FS", "SS", "DB", "S"].includes(p))     return 6;
    return 7;
  }

  // Soccer / AFL / fallback
  if (["GK", "G"].includes(p))                                         return 0;
  if (["CB", "LB", "RB", "LWB", "RWB", "SW", "D", "DF"].includes(p)) return 1;
  if (["CDM", "CM", "CAM", "LM", "RM", "MF", "M", "AM", "DM"].includes(p)) return 2;
  if (["LW", "RW", "ST", "CF", "SS", "FW", "F", "ATT"].includes(p))  return 3;
  return 4;
}

function getGroupLabel(sport: Sport, rank: number): string {
  if (sport === "basketball") {
    return (["Guards", "Small Forwards", "Power Forwards", "Centers", "Others"] as const)[rank] ?? "Others";
  }
  if (sport === "nfl") {
    return (["Quarterbacks", "Running Backs", "Receivers", "Offensive Line",
             "Defensive Line", "Linebackers", "Defensive Backs", "Specialists"] as const)[rank] ?? "Others";
  }
  return (["Goalkeepers", "Defenders", "Midfielders", "Forwards", "Others"] as const)[rank] ?? "Others";
}

// ─── Helper: best 1 key stat to show inline ─────────────────────────────────

const KEY_STAT_PRIORITY = ["PTS", "G", "goals", "YDS", "REC", "SV", "TKL", "AST", "assists", "REB"];

function firstKeyStat(stats: Record<string, string | number>): string | null {
  for (const k of KEY_STAT_PRIORITY) {
    if (stats[k] != null && stats[k] !== "—") return `${k} ${stats[k]}`;
  }
  const first = Object.entries(stats).find(([, v]) => v !== "—" && v !== "");
  return first ? `${first[0]} ${first[1]}` : null;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SquadList({
  players,
  injuries,
  sport,
  gameId,
  teamId,
  opponent,
  matchContext = "home"
}: {
  players:   ESPNPlayer[];
  injuries:  ESPNInjury[];
  sport:     Sport;
  gameId?:   string;
  teamId?:   string;
  opponent?: string;
  matchContext?: "home" | "away";
}) {
  const [selectedPlayer, setSelectedPlayer] = useState<ESPNPlayer | null>(null);
  const [loading, setLoading]               = useState(false);
  const [aflDrawerData, setAflDrawerData]   = useState<AFLPlayerAnalyticsResult | null>(null);
  const [nbaDrawerData, setNbaDrawerData]   = useState<NBAPlayerAnalyticsResult | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const isAFL = sport === "afl";
  const isNBA = sport === "basketball";

  async function handlePlayerClick(player: ESPNPlayer) {
    if (!isAFL && !isNBA) return;
    if (isNBA && !teamId) return;   // can't query without a team context

    setSelectedPlayer(player);
    setLoading(true);
    setAflDrawerData(null);
    setNbaDrawerData(null);
    setError(null);

    try {
      if (isAFL) {
        const url = `/api/afl/player/${player.id}?homeAway=${matchContext}&opponent=${encodeURIComponent(opponent || "")}&teamId=${encodeURIComponent(teamId || "")}&name=${encodeURIComponent(player.displayName)}&position=${encodeURIComponent(player.position)}&jersey=${encodeURIComponent(player.jersey ?? "")}`;
        const res = await fetch(url);
        if (!res.ok) { setError("Could not load player data."); return; }
        setAflDrawerData(await res.json());
      } else {
        const url = `/api/nba/player/${player.id}?teamId=${encodeURIComponent(teamId!)}&homeAway=${matchContext}&opponent=${encodeURIComponent(opponent || "")}&name=${encodeURIComponent(player.displayName)}&position=${encodeURIComponent(player.position)}&jersey=${encodeURIComponent(player.jersey ?? "")}&headshot=${encodeURIComponent(player.headshot ?? "")}`;
        const res = await fetch(url);
        if (!res.ok) { setError("Could not load player data."); return; }
        setNbaDrawerData(await res.json());
      }
    } catch {
      setError("Failed to fetch player analytics.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setSelectedPlayer(null);
    setAflDrawerData(null);
    setNbaDrawerData(null);
    setError(null);
    setLoading(false);
  }

  if (players.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">
        Squad data not yet available for this team.
      </p>
    );
  }

  // Build injury lookup
  const injuryById   = new Map<string, ESPNInjury>();
  const injuryByName = new Map<string, ESPNInjury>();
  for (const inj of injuries) {
    if (inj.playerId) injuryById.set(inj.playerId, inj);
    injuryByName.set(inj.playerName.toLowerCase(), inj);
  }

  const getInjury = (p: ESPNPlayer) =>
    injuryById.get(p.id) ?? injuryByName.get(p.displayName.toLowerCase());

  // Sort and Group
  const sorted = [...players].sort(
    (a, b) => positionRank(sport, a.position) - positionRank(sport, b.position)
  );

  type Group = { label: string; rank: number; players: ESPNPlayer[] };
  const groups: Group[] = [];
  for (const p of sorted) {
    const rank  = positionRank(sport, p.position);
    const label = getGroupLabel(sport, rank);
    const last  = groups[groups.length - 1];
    if (!last || last.rank !== rank) groups.push({ label, rank, players: [p] });
    else last.players.push(p);
  }

  return (
    <div>
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.rank}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1 px-2">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.players.map((player) => {
                const injury = getInjury(player);
                const badgeCls = injury?.status ? (INJURY_COLORS[injury.status] ?? INJURY_COLORS.Questionable) : null;
                const keyStat = firstKeyStat(player.seasonStats);

                // AFL and NBA: clickable button opening drawer
                if (isAFL || (isNBA && teamId)) {
                  const nbaStats = isNBA ? [
                    player.seasonStats["PTS"] != null && `${player.seasonStats["PTS"]} PTS`,
                    player.seasonStats["REB"] != null && `${player.seasonStats["REB"]} REB`,
                    player.seasonStats["AST"] != null && `${player.seasonStats["AST"]} AST`,
                  ].filter(Boolean).join(" · ") : null;

                  return (
                    <button
                      key={player.id}
                      onClick={() => handlePlayerClick(player)}
                      className="w-full flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-[#1e293b]/70 transition-colors group text-left"
                    >
                      <PlayerAvatar src={player.headshot} name={player.displayName} size={32} />
                      {player.jersey && <span className="text-[11px] text-gray-600 font-mono w-5 shrink-0 text-right">{player.jersey}</span>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-sm font-medium truncate transition-colors ${injury?.status === "Out" ? "text-gray-500 line-through" : "text-white group-hover:text-[#3B82F6]"}`}>
                            {player.displayName}
                          </span>
                          {badgeCls && injury?.status && <span className={`text-[10px] font-semibold px-1.5 py-px rounded border shrink-0 ${badgeCls}`}>{injury.status}</span>}
                        </div>
                        {nbaStats && <div className="text-[10px] text-[#4B5563] mt-0.5">{nbaStats}</div>}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-semibold text-gray-500">{player.position}</div>
                        <div className="text-[9px] text-[#374151] mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">INTEL</div>
                      </div>
                    </button>
                  );
                }

                return (
                  <Link
                    key={player.id}
                    href={`/player/${sport}/${player.id}${gameId ? `?from=${gameId}` : ""}`}
                    className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-[#1e293b]/70 transition-colors group"
                  >
                    <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#1e293b] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-500">{player.displayName[0]}</span>
                      {player.headshot && <img src={player.headshot} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                    </div>
                    {player.jersey && <span className="text-[11px] text-gray-600 font-mono w-5 shrink-0 text-right">{player.jersey}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-medium truncate transition-colors ${injury?.status === "Out" ? "text-gray-500 line-through" : "text-white group-hover:text-[#4361ee]"}`}>
                          {player.displayName}
                        </span>
                        {badgeCls && injury?.status && <span className={`text-[10px] font-semibold px-1.5 py-px rounded border shrink-0 ${badgeCls}`}>{injury.status}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-semibold text-gray-500">{player.position}</div>
                      {keyStat && <div className="text-[10px] text-gray-600 mt-0.5">{keyStat}</div>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Drawer — AFL and NBA */}
      {selectedPlayer && (isAFL || isNBA) && (
        <>
          {loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm" />
              <div className={`fixed inset-y-0 right-0 z-[70] w-full ${isNBA ? "max-w-[80vw] min-w-[320px]" : "max-w-xl"} bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center`}>
                <div className="text-center">
                  <div className="w-10 h-10 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xs font-bold text-[#6B7280] uppercase tracking-widest">Loading Intel: {selectedPlayer.displayName}</p>
                </div>
              </div>
            </>
          )}
          {error && !loading && (
            <>
              <div className="fixed inset-0 bg-black/80 z-[60]" onClick={handleClose} />
              <div className={`fixed inset-y-0 right-0 z-[70] w-full ${isNBA ? "max-w-[80vw] min-w-[320px]" : "max-w-xl"} bg-[#0B0F1A] border-l border-[#3B82F6]/20 flex items-center justify-center`}>
                <div className="text-center px-10">
                  <p className="text-[#EF4444] font-bold mb-4 uppercase tracking-tight">{error}</p>
                  <button onClick={handleClose} className="text-xs font-black text-[#6B7280] hover:text-white underline uppercase tracking-widest">Close</button>
                </div>
              </div>
            </>
          )}
          {aflDrawerData && !loading && (
            <PlayerDrawer data={aflDrawerData} onClose={handleClose} />
          )}
          {nbaDrawerData && !loading && (
            <NBAPlayerDrawer data={nbaDrawerData} onClose={handleClose} />
          )}
        </>
      )}
    </div>
  );
}
