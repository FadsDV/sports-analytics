"use client";

import { useState, useEffect, useCallback } from "react";
import type { LiveGameState } from "@/app/api/game/[id]/live/route";
import { formatAFLKickoff, formatKickoffFull } from "@/lib/utils";

interface LiveScorePanelProps {
  gameId:        string;
  initial:       LiveGameState;
  homeShortName: string;
  awayShortName: string;
  isAFL:         boolean;
  isBasketball:  boolean;
  kickoff:       string;
  venue:         string;
}

export default function LiveScorePanel({
  gameId,
  initial,
  homeShortName,
  awayShortName,
  isAFL,
  isBasketball,
  kickoff,
  venue,
}: LiveScorePanelProps) {
  const [data, setData]           = useState<LiveGameState>(initial);
  const [updatedSec, setUpdatedSec] = useState(0);
  const [fetching, setFetching]   = useState(false);

  const isLive = data.status === "live";

  const poll = useCallback(async () => {
    if (fetching) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/game/${gameId}/live`, { cache: "no-store" });
      if (!res.ok) return;
      const updated: LiveGameState = await res.json();
      setData(updated);
      setUpdatedSec(0);
    } catch {
      // silently ignore — stale data is fine
    } finally {
      setFetching(false);
    }
  }, [gameId, fetching]);

  // Kick off immediate poll on mount when live (get fresh clock from server)
  useEffect(() => {
    if (initial.status === "live") poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 15-second polling interval — only when live
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [isLive, poll]);

  // "Updated Xs ago" — increments every second while live
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setUpdatedSec(s => s + 1), 1_000);
    return () => clearInterval(id);
  }, [isLive]);

  const { homeScore, awayScore, status, period, displayClock, lineScores } = data;

  // ── Upcoming ───────────────────────────────────────────────────────────────
  if (status === "upcoming") {
    return (
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#4B5563] mb-2">Pre-Match</div>
        <div className="text-3xl font-bold text-[#1e3a5f]">vs</div>
        <div className="text-xs text-[#3B82F6] mt-2">
          {isAFL ? formatAFLKickoff(kickoff, venue) : formatKickoffFull(kickoff)}
        </div>
      </div>
    );
  }

  // ── Live / Finished ────────────────────────────────────────────────────────
  return (
    <div>
      {/* Main score */}
      <div className="text-5xl sm:text-6xl font-black text-white tabular-nums tracking-tight">
        {homeScore ?? 0}
        <span className="text-[#1e293b] mx-2 font-light">–</span>
        {awayScore ?? 0}
      </div>

      {/* Quarter / period line scores */}
      {(isBasketball || isAFL) && lineScores && lineScores.home.length > 0 && (
        <div className="mt-3 inline-block">
          <div
            className="grid gap-x-3 text-[11px] tabular-nums"
            style={{ gridTemplateColumns: `auto repeat(${lineScores.home.length}, 1fr)` }}
          >
            <span />
            {lineScores.home.map((_, i) => (
              <span key={i} className="text-center text-[#374151]">Q{i + 1}</span>
            ))}
            <span className="text-right text-[#9CA3AF] pr-1">{homeShortName}</span>
            {lineScores.home.map((q, i) => (
              <span key={i} className="text-center text-[#E5E7EB]">{q}</span>
            ))}
            <span className="text-right text-[#9CA3AF] pr-1">{awayShortName}</span>
            {lineScores.away.map((q, i) => (
              <span key={i} className="text-center text-[#E5E7EB]">{q}</span>
            ))}
          </div>
        </div>
      )}

      {/* Live status + updated timestamp */}
      {status === "live" && (
        <div className="mt-2 flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-red-400">
              {period ? `Q${period}` : "LIVE"}
              {displayClock ? ` ${displayClock}` : ""}
            </span>
          </div>
          <span className="text-[10px] text-[#374151]">
            Updated {updatedSec}s ago
          </span>
        </div>
      )}
    </div>
  );
}
