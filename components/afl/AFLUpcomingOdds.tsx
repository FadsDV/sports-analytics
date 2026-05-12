"use client";

import { useEffect, useState } from "react";
import { OddsEvent, NormalizedOddsResponse, BookmakerOdds } from "@/lib/providers/odds/types";
import { resolveTeamCanonicalId } from "@/lib/mappings";

interface AFLUpcomingOddsProps {
  homeTeamName: string;
  awayTeamName: string;
}

interface BestOdds {
  price: number;
  bookmaker: string;
}

export default function AFLUpcomingOdds({
  homeTeamName,
  awayTeamName,
}: AFLUpcomingOddsProps) {
  const [loading, setLoading] = useState(true);
  const [eventOdds, setEventOdds] = useState<OddsEvent | null>(null);
  const [bookmakerCount, setBookmakerCount] = useState(0);
  const [bestHome, setBestHome] = useState<BestOdds | null>(null);
  const [bestAway, setBestAway] = useState<BestOdds | null>(null);
  const [freshness, setFreshness] = useState<string>("");

  useEffect(() => {
    async function fetchOdds() {
      try {
        const homeId = resolveTeamCanonicalId(homeTeamName, "afl");
        const awayId = resolveTeamCanonicalId(awayTeamName, "afl");

        const res = await fetch("/api/odds/afl?markets=h2h");
        if (!res.ok) throw new Error("Failed to fetch odds");
        
        const data = await res.json();
        const allProviders: NormalizedOddsResponse[] = data.results;
        
        // Find the matching event across all providers using canonical IDs
        let foundEvent: OddsEvent | null = null;
        let totalBookmakers = 0;

        for (const provider of allProviders) {
          const match = provider.events.find(e => 
            (e.homeTeamId === homeId && e.awayTeamId === awayId) ||
            (e.homeTeamId === awayId && e.awayTeamId === homeId)
          );

          if (match) {
            foundEvent = match;
            totalBookmakers = match.bookmakers.length;
            
            // Find best odds across all bookmakers in this event
            let bestH: BestOdds | null = null;
            let bestA: BestOdds | null = null;
            let latestUpdate: Date | null = null;

            match.bookmakers.forEach((bm: BookmakerOdds) => {
              const h2h = bm.markets.find(m => m.key === "h2h");
              if (h2h) {
                const updateDate = new Date(h2h.lastUpdate);
                if (!latestUpdate || updateDate > latestUpdate) {
                  latestUpdate = updateDate;
                }

                const hOutcome = h2h.outcomes.find(o => resolveTeamCanonicalId(o.name, "afl") === homeId);
                const aOutcome = h2h.outcomes.find(o => resolveTeamCanonicalId(o.name, "afl") === awayId);

                if (hOutcome && (!bestH || hOutcome.price > bestH.price)) {
                  bestH = { price: hOutcome.price, bookmaker: bm.title };
                }
                if (aOutcome && (!bestA || aOutcome.price > bestA.price)) {
                  bestA = { price: aOutcome.price, bookmaker: bm.title };
                }
              }
            });

            setBestHome(bestH);
            setBestAway(bestA);
            
            if (latestUpdate) {
              const secondsAgo = Math.floor((Date.now() - (latestUpdate as Date).getTime()) / 1000);
              if (secondsAgo < 60) setFreshness(`${secondsAgo}s ago`);
              else setFreshness(`${Math.floor(secondsAgo / 60)}m ago`);
            }
            
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

  if (!eventOdds || !bestHome || !bestAway) {
    return (
      <div className="text-center py-4 bg-[#0d1827] rounded-lg border border-white/[0.03]">
        <span className="text-[10px] text-[#4B5563] uppercase tracking-widest font-bold">Odds temporarily unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {/* Home Odds */}
        <div className="bg-[#0d1827] border border-white/[0.03] rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-white truncate max-w-[120px]">{homeTeamName}</span>
            <span className="text-[9px] text-[#4B5563]">{bestHome.bookmaker}</span>
          </div>
          <span className="text-lg font-black text-[#3B82F6] tabular-nums">
            {bestHome.price.toFixed(2)}
          </span>
        </div>

        {/* Away Odds */}
        <div className="bg-[#0d1827] border border-white/[0.03] rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-white truncate max-w-[120px]">{awayTeamName}</span>
            <span className="text-[9px] text-[#4B5563]">{bestAway.bookmaker}</span>
          </div>
          <span className="text-lg font-black text-[#3B82F6] tabular-nums">
            {bestAway.price.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 mt-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-[#22C55E]" />
          <span className="text-[9px] text-[#4B5563] font-medium">
            {bookmakerCount} bookmakers live
          </span>
        </div>
        <span className="text-[9px] text-[#374151] tabular-nums font-medium">
          Updated {freshness}
        </span>
      </div>
    </div>
  );
}
