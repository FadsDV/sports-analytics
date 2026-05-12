/* eslint-disable @next/next/no-img-element */
import {
  fetchCS2Live,
  fetchCS2Upcoming,
  fetchCS2Past,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import CS2MatchCard from "@/components/cs2/CS2MatchCard";
import type { EsportsMatch } from "@/lib/esports/types";

export const revalidate = 60;

export default async function CS2SchedulePage() {
  if (!hasAPIKey()) {
    return <NoAPIKey />;
  }

  const [live, upcoming, past] = await Promise.all([
    fetchCS2Live(),
    fetchCS2Upcoming(20),
    fetchCS2Past(20),
  ]);

  const hasAny = live.length + upcoming.length + past.length > 0;

  return (
    <div className="max-w-3xl px-4 pt-4 pb-10 mx-auto">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-7 h-7 rounded bg-[#1e293b] flex items-center justify-center shrink-0">
          <span className="text-[10px] text-[#9CA3AF] font-bold">CS2</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-white">Counter-Strike 2</h1>
          <p className="text-[11px] text-[#4B5563]">Matches · Schedules · Results</p>
        </div>
        {live.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {live.length} live
          </span>
        )}
      </div>

      {!hasAny && <EmptyState label="No matches found." />}

      {/* Live */}
      {live.length > 0 && (
        <Section title="Live Now" accent="red">
          {live.map(m => <CS2MatchCard key={m.id} match={m} />)}
        </Section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <Section title="Upcoming">
          <MatchGroup matches={upcoming} />
        </Section>
      )}

      {/* Results */}
      {past.length > 0 && (
        <Section title="Results">
          {past.map(m => <CS2MatchCard key={m.id} match={m} />)}
        </Section>
      )}
    </div>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

function MatchGroup({ matches }: { matches: EsportsMatch[] }) {
  const groups = new Map<string, EsportsMatch[]>();
  for (const m of matches) {
    const dateKey = m.scheduledAt
      ? new Date(m.scheduledAt).toLocaleDateString("en-AU", {
          weekday: "short", month: "short", day: "numeric",
        })
      : "TBD";
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(m);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([date, group]) => (
        <div key={date} className="mb-4">
          <div className="text-[9px] text-[#374151] uppercase tracking-widest mb-2 px-0.5">
            {date}
          </div>
          <div className="flex flex-col gap-2">
            {group.map(m => <CS2MatchCard key={m.id} match={m} />)}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Shared layout atoms ──────────────────────────────────────────────────────

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: "red";
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {accent === "red" && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        )}
        <span className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-[#374151]">{label}</p>
    </div>
  );
}

function NoAPIKey() {
  return (
    <div className="max-w-3xl px-4 pt-10 pb-10 mx-auto">
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 text-center">
        <div className="text-2xl mb-3 text-[#374151]">CS2</div>
        <h2 className="text-sm font-semibold text-white mb-1">PandaScore API key required</h2>
        <p className="text-[11px] text-[#4B5563] max-w-sm mx-auto">
          Add <code className="text-[#9CA3AF] bg-[#1e293b] px-1 rounded">PANDASCORE_API_KEY</code> to{" "}
          <code className="text-[#9CA3AF] bg-[#1e293b] px-1 rounded">.env.local</code> to enable CS2 match data.
        </p>
      </div>
    </div>
  );
}
