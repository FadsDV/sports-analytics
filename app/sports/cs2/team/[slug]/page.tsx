/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchCS2Team,
  fetchCS2TeamMatches,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import CS2RosterRow from "@/components/cs2/CS2RosterRow";
import CS2MatchCard from "@/components/cs2/CS2MatchCard";

export const revalidate = 3600;

export default async function CS2TeamPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!hasAPIKey()) {
    return (
      <div className="max-w-3xl px-4 pt-10 pb-10 mx-auto">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 text-center">
          <p className="text-sm text-[#4B5563]">
            PandaScore API key required.
          </p>
        </div>
      </div>
    );
  }

  const [team, recentMatches] = await Promise.all([
    fetchCS2Team(params.slug),
    fetchCS2TeamMatches(params.slug, 6),
  ]);

  if (!team) notFound();

  return (
    <div className="max-w-3xl px-4 pt-4 pb-10 mx-auto">

      {/* Back */}
      <Link
        href="/sports/cs2"
        className="inline-flex items-center gap-1 text-xs text-[#374151] hover:text-[#9CA3AF] mb-4 transition-colors"
      >
        ← CS2
      </Link>

      {/* ── Team header ── */}
      <div className="bg-[#111827] rounded-2xl px-5 py-5 mb-4 flex items-center gap-4">
        {team.imageUrl ? (
          <img src={team.imageUrl} alt={team.name} className="w-16 h-16 object-contain shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-[#1e293b] flex items-center justify-center shrink-0">
            <span className="text-lg text-[#4B5563] font-bold">{team.acronym.slice(0, 3)}</span>
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-white leading-tight">{team.name}</h1>
          <div className="text-xs text-[#4B5563] mt-0.5">{team.acronym} · CS2</div>
        </div>

        {/* Ranking placeholder */}
        <div className="ml-auto text-right">
          <div className="text-[9px] text-[#374151] uppercase tracking-wider mb-0.5">Ranking</div>
          <div className="text-xs text-[#1e3a5f]">—</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* ── Roster ── */}
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
          <SectionHeader title="Active Roster" />
          <div className="px-3 pb-1">
            {team.players && team.players.length > 0 ? (
              team.players.map(p => <CS2RosterRow key={p.id} player={p} />)
            ) : (
              <p className="text-xs text-[#374151] py-4 text-center">No roster data.</p>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="flex flex-col gap-4">

          {/* Recent matches */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
            <SectionHeader title="Recent Matches" />
            <div className="px-3 pb-3 flex flex-col gap-2">
              {recentMatches.length > 0 ? (
                recentMatches.map(m => <CS2MatchCard key={m.id} match={m} />)
              ) : (
                <p className="text-xs text-[#374151] py-4 text-center">No recent matches.</p>
              )}
            </div>
          </div>

          {/* Tournament history placeholder */}
          <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
            <SectionHeader title="Tournament History" />
            <div className="px-3 pb-4 pt-2">
              <p className="text-[11px] text-[#1e3a5f]">
                Tournament results will be available in a future update.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-2.5 border-b border-[#1e293b]">
      <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}
