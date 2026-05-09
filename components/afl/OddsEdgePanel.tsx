"use client";

import { useEffect, useState } from "react";
import { GameOdds, oddsEngine, calculateEdge, impliedProbability } from "@/lib/sports/odds";
import { Sport } from "@/lib/types";

interface OddsEdgePanelProps {
  gameId: string;
  sport: Sport;
  homeTeamName: string;
  awayTeamName: string;
  estimatedHomeProb: number; // 0-100
}

export default function OddsEdgePanel({
  gameId,
  sport,
  homeTeamName,
  awayTeamName,
  estimatedHomeProb,
}: OddsEdgePanelProps) {
  const [odds, setOdds] = useState<GameOdds | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOdds() {
      const allOdds = await oddsEngine.getGameOdds(sport, gameId);
      if (allOdds.length > 0) {
        setOdds(allOdds[0]);
      }
      setLoading(false);
    }
    loadOdds();
  }, [gameId, sport]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-12 bg-white/5 rounded-lg" />
        <div className="h-12 bg-white/5 rounded-lg" />
      </div>
    );
  }

  if (!odds) {
    return (
      <div className="text-center py-4">
        <p className="text-[10px] text-[#4B5563]">No odds available for this match</p>
      </div>
    );
  }

  // Use the first bookmaker for now
  const bookie = odds.bookmakers[0];
  const h2hMarket = bookie.markets.find(m => m.type === "h2h");
  const spreadMarket = bookie.markets.find(m => m.type === "spread");
  const totalMarket = bookie.markets.find(m => m.type === "total");

  const homeSelection = h2hMarket?.selections.find(s => s.name === "Home Team");
  const awaySelection = h2hMarket?.selections.find(s => s.name === "Away Team");

  const homeEdge = homeSelection ? calculateEdge(homeSelection.price, estimatedHomeProb / 100) : null;
  const awayEdge = awaySelection ? calculateEdge(awaySelection.price, (100 - estimatedHomeProb) / 100) : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {/* Home Win */}
        <div className={`bg-[#0d1827] rounded-lg px-2.5 py-2 flex flex-col gap-1 ${homeEdge?.isValue ? "ring-1 ring-[#22C55E]/30" : ""}`}>
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-medium text-[#4B5563] uppercase tracking-wide">Home Win</span>
            {homeEdge?.isValue && <span className="text-[8px] font-bold text-[#22C55E] uppercase tracking-wider">Value</span>}
          </div>
          <div className="flex items-end justify-between">
            <span className="text-lg font-black text-white tabular-nums">{homeSelection?.price.toFixed(2) ?? "—"}</span>
            <span className="text-[9px] text-[#374151] tabular-nums mb-1">{Math.round(impliedProbability(homeSelection?.price ?? 0) * 100)}% imp.</span>
          </div>
        </div>

        {/* Away Win */}
        <div className={`bg-[#0d1827] rounded-lg px-2.5 py-2 flex flex-col gap-1 ${awayEdge?.isValue ? "ring-1 ring-[#22C55E]/30" : ""}`}>
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-medium text-[#4B5563] uppercase tracking-wide">Away Win</span>
            {awayEdge?.isValue && <span className="text-[8px] font-bold text-[#22C55E] uppercase tracking-wider">Value</span>}
          </div>
          <div className="flex items-end justify-between">
            <span className="text-lg font-black text-white tabular-nums">{awaySelection?.price.toFixed(2) ?? "—"}</span>
            <span className="text-[9px] text-[#374151] tabular-nums mb-1">{Math.round(impliedProbability(awaySelection?.price ?? 0) * 100)}% imp.</span>
          </div>
        </div>

        {/* Spread */}
        <div className="bg-[#0d1827] rounded-lg px-2.5 py-2 flex flex-col gap-1">
          <span className="text-[9px] font-medium text-[#4B5563] uppercase tracking-wide">Spread</span>
          <div className="flex items-end justify-between">
            <span className="text-lg font-black text-white tabular-nums">
              {spreadMarket?.selections[0].points ?? "—"}
            </span>
            <span className="text-[10px] text-[#9CA3AF] font-bold tabular-nums mb-1">
              {spreadMarket?.selections[0].price.toFixed(2) ?? "—"}
            </span>
          </div>
        </div>

        {/* Total */}
        <div className="bg-[#0d1827] rounded-lg px-2.5 py-2 flex flex-col gap-1">
          <span className="text-[9px] font-medium text-[#4B5563] uppercase tracking-wide">Total</span>
          <div className="flex items-end justify-between">
            <span className="text-lg font-black text-white tabular-nums">
              {totalMarket?.selections[0].points ?? "—"}
            </span>
            <span className="text-[10px] text-[#9CA3AF] font-bold tabular-nums mb-1">
              {totalMarket?.selections[0].price.toFixed(2) ?? "—"}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between px-1">
        <span className="text-[9px] text-[#374151]">via {bookie.title}</span>
        {homeEdge?.isValue && (
          <span className="text-[9px] text-[#22C55E] font-medium">+{Math.round(homeEdge.ev * 100)}% EV Edge</span>
        )}
        {awayEdge?.isValue && !homeEdge?.isValue && (
          <span className="text-[9px] text-[#22C55E] font-medium">+{Math.round(awayEdge.ev * 100)}% EV Edge</span>
        )}
      </div>
    </div>
  );
}
