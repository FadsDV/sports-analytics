"use client";

import { useEffect, useState } from "react";
import { OddsEvent, NormalizedOddsResponse } from "@/lib/providers/odds/types";

interface AFLUpcomingOddsProps {
  homeTeamName: string;
  awayTeamName: string;
}

export default function AFLUpcomingOdds({
  homeTeamName,
  awayTeamName,
}: AFLUpcomingOddsProps) {
  const [loading, setLoading] = useState(true);
  const [eventOdds, setEventOdds] = useState<OddsEvent | null>(null);
  const [bookmakerCount, setBookmakerCount] = useState(0);

  useEffect(() => {
    async function fetchOdds() {
      try {
        const res = await fetch("/api/odds/afl?markets=h2h");
        if (!res.ok) throw new Error("Failed to fetch odds");
        
        const data = await res.json();
        const allProviders: NormalizedOddsResponse[] = data.results;
        
        // Find the matching event across all providers
        // We match by team names (case-insensitive fuzzy match could be better, but start simple)
        let foundEvent: OddsEvent | null = null;
        let totalBookmakers = 0;

        for (const provider of allProviders) {
          const match = provider.events.find(e => 
            (e.homeTeam.toLowerCase().includes(homeTeamName.toLowerCase()) || homeTeamName.toLowerCase().includes(e.homeTeam.toLowerCase())) &&
            (e.awayTeam.toLowerCase().includes(awayTeamName.toLowerCase()) || awayTeamName.toLowerCase().includes(e.awayTeam.toLowerCase()))
          );

          if (match) {
            // For now, just take the first one found, but sum up bookmakers if we wanted
            // but different providers might have different events. 
            // We'll just stick to the first provider that has this game.
            foundEvent = match;
            totalBookmakers = match.bookmakers.length;
            break; 
          }
        }

        setEventOdds(foundEvent);
        setBookmakerCount(totalBookmakers);
      } catch (err) {
        console.error("[AFLUpcomingOdds] Error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchOdds();
  }, [homeTeamName, awayTeamName]);

  if (loading) {
    return (
      <div className="animate-pulse flex flex-col gap-2">
        <div className="h-10 bg-white/5 rounded-lg" />
        <div className="h-4 w-24 bg-white/5 rounded mx-auto" />
      </div>
    );
  }

  if (!eventOdds || eventOdds.bookmakers.length === 0) {
    return (
      <div className="text-center py-2">
        <span className="text-[10px] text-[#4B5563]">Odds unavailable for this matchup</span>
      </div>
    );
  }

  // Get the first bookmaker's H2H market
  const firstBookie = eventOdds.bookmakers[0];
  const h2hMarket = firstBookie.markets.find(m => m.key === "h2h");
  
  if (!h2hMarket) {
    return (
      <div className="text-center py-2">
        <span className="text-[10px] text-[#4B5563]">No H2H market found</span>
      </div>
    );
  }

  const homeOutcome = h2hMarket.outcomes.find(o => 
    o.name.toLowerCase().includes(homeTeamName.toLowerCase()) || homeTeamName.toLowerCase().includes(o.name.toLowerCase())
  );
  const awayOutcome = h2hMarket.outcomes.find(o => 
    o.name.toLowerCase().includes(awayTeamName.toLowerCase()) || awayTeamName.toLowerCase().includes(o.name.toLowerCase())
  );

  const lastUpdate = new Date(h2hMarket.lastUpdate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {/* Home Odds */}
        <div className="bg-[#0d1827] border border-white/[0.03] rounded-lg px-3 py-2 flex flex-col items-center">
          <span className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-0.5">Home</span>
          <span className="text-lg font-black text-white tabular-nums">
            {homeOutcome?.price.toFixed(2) ?? "—"}
          </span>
        </div>

        {/* Away Odds */}
        <div className="bg-[#0d1827] border border-white/[0.03] rounded-lg px-3 py-2 flex flex-col items-center">
          <span className="text-[9px] text-[#6B7280] uppercase tracking-wider mb-0.5">Away</span>
          <span className="text-lg font-black text-white tabular-nums">
            {awayOutcome?.price.toFixed(2) ?? "—"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-[#22C55E]" />
          <span className="text-[9px] text-[#4B5563]">
            {bookmakerCount} bookmakers live
          </span>
        </div>
        <span className="text-[9px] text-[#374151]">
          Updated {lastUpdate}
        </span>
      </div>
    </div>
  );
}
