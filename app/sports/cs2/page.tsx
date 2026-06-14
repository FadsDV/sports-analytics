/* eslint-disable @next/next/no-img-element */
import { fetchCS2Live, fetchCS2Upcoming, fetchCS2Past, hasAPIKey } from "@/lib/sports/cs2/client";
import CS2MatchCard from "@/components/cs2/CS2MatchCard";
import type { EsportsMatch } from "@/lib/esports/types";

export const revalidate = 60;

function groupByDate(matches: EsportsMatch[]): [string, EsportsMatch[]][] {
  const map = new Map<string, EsportsMatch[]>();
  for (const m of matches) {
    const raw = m.scheduledAt ?? m.endAt ?? "";
    const label = raw
      ? new Date(raw).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
      : "Unknown date";
    const existing = map.get(label) ?? [];
    existing.push(m);
    map.set(label, existing);
  }
  return Array.from(map.entries());
}

function NoAPIKey() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="text-3xl text-[#374151]">◎</div>
      <p className="text-sm text-[#374151]">PANDASCORE_API_KEY not configured.</p>
      <p className="text-[11px] text-[#1e293b]">Set it in your .env.local to enable CS2 data.</p>
    </div>
  );
}

export default async function CS2Page() {
  if (!hasAPIKey()) return <NoAPIKey />;

  const [live, upcoming, past] = await Promise.all([
    fetchCS2Live(),
    fetchCS2Upcoming(20),
    fetchCS2Past(10),
  ]);

  const upcomingByDate = groupByDate(upcoming);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded bg-[#1e293b] flex items-center justify-center">
          <span className="text-[10px] font-bold text-[#94a3b8]">CS2</span>
        </div>
        <h1 className="text-lg font-bold text-white">Counter-Strike 2</h1>
        {live.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {live.length} LIVE
          </span>
        )}
      </div>

      {/* Live */}
      {live.length > 0 && (
        <section>
          <SectionHeader label="Live" accent />
          <div className="space-y-2">
            {live.map((m) => (
              <CS2MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <SectionHeader label="Upcoming" />
          <div className="space-y-5">
            {upcomingByDate.map(([date, matches]) => (
              <div key={date}>
                <div className="text-[10px] text-[#374151] uppercase tracking-wider mb-2">{date}</div>
                <div className="space-y-2">
                  {matches.map((m) => (
                    <CS2MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Results */}
      {past.length > 0 && (
        <section>
          <SectionHeader label="Results" />
          <div className="space-y-2">
            {past.map((m) => (
              <CS2MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {live.length === 0 && upcoming.length === 0 && past.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-2">
          <p className="text-sm text-[#374151]">No CS2 matches found.</p>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${
          accent ? "text-red-400" : "text-[#94a3b8]"
        }`}
      >
        {label}
      </span>
      <div className="flex-1 h-px bg-[#1e293b]" />
    </div>
  );
}
