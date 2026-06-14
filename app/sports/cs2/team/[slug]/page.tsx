/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import {
  fetchCS2Team,
  fetchCS2TeamMatches,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import {
  getTeamForm,
  getMapWinrates,
  getRecentMatches,
  getRosterStability,
} from "@/lib/esports/analytics";
import CS2RosterRow from "@/components/cs2/CS2RosterRow";
import { TeamFormSection } from "@/components/cs2/analytics/TeamFormSection";
import { MapPoolSection } from "@/components/cs2/analytics/MapPoolSection";
import { RosterStabilitySection } from "@/components/cs2/analytics/RosterStabilitySection";
import { RecentMatchesSection } from "@/components/cs2/analytics/RecentMatchesSection";

export const revalidate = 3600;

export default async function CS2TeamPage({
  params,
}: {
  params: { slug: string };
}) {
  if (!hasAPIKey()) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[#374151]">PANDASCORE_API_KEY not configured.</p>
      </div>
    );
  }

  const [team, matches] = await Promise.all([
    fetchCS2Team(params.slug),
    fetchCS2TeamMatches(params.slug, 20),
  ]);

  if (!team) notFound();

  // Compute analytics
  const form = getTeamForm(team.id, matches, 10);
  const mapWinrates = getMapWinrates(team.id, matches);
  const recentMatches = getRecentMatches(team.id, matches, 10);
  const stability = getRosterStability(team, matches, 5);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Team header */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
        <div className="flex items-center gap-4">
          {team.imageUrl ? (
            <img
              src={team.imageUrl}
              alt=""
              className="w-14 h-14 object-contain shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-[#1e293b] flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[#4B5563]">
                {team.acronym?.slice(0, 4)}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">{team.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-wider border border-[#1e293b] rounded px-1.5 py-0.5">
                {team.acronym}
              </span>
              {team.region && (
                <span className="text-[10px] text-[#374151]">{team.region}</span>
              )}
              <span className="text-[10px] text-[#374151] uppercase tracking-wider">CS2</span>
            </div>
          </div>
        </div>
      </div>

      {/* Form + Maps row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamFormSection form={form} />
        <MapPoolSection mapWinrates={mapWinrates} />
      </div>

      {/* Roster stability */}
      <RosterStabilitySection stability={stability} />

      {/* Recent matches */}
      <RecentMatchesSection entries={recentMatches} />

      {/* Full roster */}
      {team.players && team.players.length > 0 && (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1e293b]">
            <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
              Roster
            </span>
          </div>
          <div className="px-4">
            {team.players.map((p) => (
              <CS2RosterRow key={p.id} player={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
