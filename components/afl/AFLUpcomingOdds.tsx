"use client";

import { useEffect, useState } from "react";
import { OddsEvent, NormalizedOddsResponse, BookmakerOdds } from "@/lib/providers/odds/types";
import { resolveTeamCanonicalId } from "@/lib/mappings";

interface AFLUpcomingOddsProps {
  homeTeamName: string;
  awayTeamName: string;
  kickoff?: string; // ISO string — used to throttle API usage
}

interface BestOdds {
  price: number;
  bookmaker: string;
}

export default function AFLUpcomingOdds({ homeTeamName, awayTeamName, kickoff }: AFLUpcomingOddsProps) {
  const [loading, setLoading]           = useState(true);
  const [eventOdds, setEventOdds]       = useState<OddsEvent | null>(null);
  const [bookmakerCount, setBookmakerCount] = useState(0);
  const [bestHome, setBestHome]         = useState<BestOdds | null>(null);
  const [bestAway, setBestAway]         = useState<BestOdds | null>(null);
  const [allOdds, setAllOdds]           = useState<{ bm: string; home: number; away: number }[]>([]);
  const [freshness, setFreshness]       = useState("");

  useEffect(() => {
    async function fetchOdds() {
      try {
        const homeId = resolveTeamCanonicalId(homeTeamName, "afl");
        const awayId = resolveTeamCanonicalId(awayTeamName, "afl");

        const qs = kickoff ? `&kickoff=${encodeURIComponent(kickoff)}` : "";
        const res = await fetch(`/api/odds/afl?markets=h2h${qs}`);
        if (!res.ok) throw new Error("Failed to fetch odds");

        const data = await res.json();
        const allProviders: NormalizedOddsResponse[] = data.results;

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

            let bestH: BestOdds | null = null;
            let bestA: BestOdds | null = null;
            let latestUpdate: Date | null = null;
            const rows: { bm: string; home: number; away: number }[] = [];

            match.bookmakers.forEach((bm: BookmakerOdds) => {
              const h2h = bm.markets.find(m => m.key === "h2h");
              if (!h2h) return;

              const updateDate = new Date(h2h.lastUpdate);
              if (!latestUpdate || updateDate > latestUpdate) latestUpdate = updateDate;

              const hOutcome = h2h.outcomes.find(o => resolveTeamCanonicalId(o.name, "afl") === homeId);
              const aOutcome = h2h.outcomes.find(o => resolveTeamCanonicalId(o.name, "afl") === awayId);

              if (hOutcome && aOutcome) {
                rows.push({ bm: bm.title, home: hOutcome.price, away: aOutcome.price });
                if (!bestH || hOutcome.price > bestH.price) bestH = { price: hOutcome.price, bookmaker: bm.title };
                if (!bestA || aOutcome.price > bestA.price) bestA = { price: aOutcome.price, bookmaker: bm.title };
              }
            });

            // Sort by best home price descending
            rows.sort((a, b) => b.home - a.home);
            setAllOdds(rows);
            setBestHome(bestH);
            setBestAway(bestA);

            if (latestUpdate) {
              const sec = Math.floor((Date.now() - (latestUpdate as Date).getTime()) / 1000);
              setFreshness(sec < 60 ? `${sec}s ago` : `${Math.floor(sec / 60)}m ago`);
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
        <div className="h-10 bg-surface2 rounded-lg" />
        <div className="h-3 w-32 bg-surface2 rounded" />
        <div className="h-24 bg-surface2 rounded-lg" />
      </div>
    );
  }

  if (!eventOdds || !bestHome || !bestAway) {
    return (
      <div className="text-center py-4 bg-surface2 rounded-lg border border-border">
        <span className="text-[10px] text-text-2 uppercase tracking-widest font-bold">Odds temporarily unavailable</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Best odds highlight */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface2 border border-border rounded-lg px-3 py-2.5">
          <div className="text-[9px] text-text-2 uppercase tracking-widest mb-1">Best {homeTeamName.split(" ").pop()}</div>
          <div className="text-xl font-black text-primary tabular-nums">{bestHome.price.toFixed(2)}</div>
          <div className="text-[9px] text-text-2 mt-0.5">{bestHome.bookmaker}</div>
        </div>
        <div className="bg-surface2 border border-border rounded-lg px-3 py-2.5">
          <div className="text-[9px] text-text-2 uppercase tracking-widest mb-1">Best {awayTeamName.split(" ").pop()}</div>
          <div className="text-xl font-black text-primary tabular-nums">{bestAway.price.toFixed(2)}</div>
          <div className="text-[9px] text-text-2 mt-0.5">{bestAway.bookmaker}</div>
        </div>
      </div>

      {/* Bookmaker comparison table */}
      {allOdds.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-3 px-3 py-1.5 bg-surface2 border-b border-border">
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-2">Bookmaker</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-2 text-right">{homeTeamName.split(" ").pop()}</span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-2 text-right">{awayTeamName.split(" ").pop()}</span>
          </div>
          {(() => {
            // Preferred bookmakers — always shown first
            const PREFERRED = ["Bet365", "Sportsbet", "Ladbrokes", "Dabble"];
            const oddsMap = new Map(allOdds.map(r => [r.bm.toLowerCase(), r]));

            // Fuzzy-match preferred names to actual bookmaker keys
            const preferredRows: { label: string; row: typeof allOdds[number] | null }[] = PREFERRED.map(label => {
              const match = allOdds.find(r =>
                r.bm.toLowerCase().includes(label.toLowerCase()) ||
                label.toLowerCase().includes(r.bm.toLowerCase())
              );
              return { label, row: match ?? null };
            });

            // Remaining bookmakers not in preferred list
            const preferredKeys = new Set(preferredRows.flatMap(p => p.row ? [p.row.bm] : []));
            const otherRows = allOdds.filter(r => !preferredKeys.has(r.bm));

            const renderRow = (bm: string, row: typeof allOdds[number] | null, i: number) => {
              const isBestHome = row && row.home === bestHome!.price;
              const isBestAway = row && row.away === bestAway!.price;
              return (
                <div key={i} className="grid grid-cols-3 px-3 py-2 border-b border-border last:border-0 hover:bg-surface2 transition-colors">
                  <span className="text-[10px] text-text-2 truncate">{bm}</span>
                  {row ? (
                    <>
                      <span className={`text-[10px] font-bold tabular-nums text-right ${isBestHome ? "text-primary" : "text-text-1"}`}>
                        {row.home.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-bold tabular-nums text-right ${isBestAway ? "text-primary" : "text-text-1"}`}>
                        {row.away.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-text-2/40 text-right">N/A</span>
                      <span className="text-[10px] text-text-2/40 text-right">N/A</span>
                    </>
                  )}
                </div>
              );
            };

            return (
              <>
                {preferredRows.map(({ label, row }, i) => renderRow(row?.bm ?? label, row, i))}
                {otherRows.length > 0 && (
                  <>
                    <div className="px-3 py-1 bg-surface2/50 border-b border-border">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-text-2/50">Other</span>
                    </div>
                    {otherRows.map((row, i) => renderRow(row.bm, row, i + PREFERRED.length))}
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
          <span className="text-[9px] text-text-2">{bookmakerCount} bookmakers</span>
        </div>
        <span className="text-[9px] text-text-2 tabular-nums">Updated {freshness}</span>
      </div>
    </div>
  );
}
