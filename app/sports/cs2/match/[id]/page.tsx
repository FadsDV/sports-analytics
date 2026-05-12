/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchCS2Match,
  fetchCS2TeamMatchesByExternalId,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import {
  getTeamForm,
  getHeadToHead,
  getMapWinrates,
  getRecentMatches,
} from "@/lib/esports/analytics";
import CS2StatusBadge from "@/components/cs2/CS2StatusBadge";
import CS2RosterRow from "@/components/cs2/CS2RosterRow";
import { HeadToHeadSection } from "@/components/cs2/analytics/HeadToHeadSection";
import { TeamFormComparison } from "@/components/cs2/analytics/TeamFormComparison";
import { MapPoolComparison } from "@/components/cs2/analytics/MapPoolComparison";
import { RecentMatchesSection } from "@/components/cs2/analytics/RecentMatchesSection";
import { formatKickoff } from "@/lib/utils";
import type { EsportsTeam } from "@/lib/esports/types";

export const revalidate = 30;

export default async function CS2MatchPage({ params }: { params: { id: string } }) {
  if (!hasAPIKey()) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[#374151]">PANDASCORE_API_KEY not configured.</p>
      </div>
    );
  }

  const match = await fetchCS2Match(params.id);
  if (!match) notFound();

  const homeExtId = match.homeTeam?.externalId;
  const awayExtId = match.awayTeam?.externalId;

  const [homeMatches, awayMatches] = await Promise.all([
    homeExtId ? fetchCS2TeamMatchesByExternalId(homeExtId, 20) : Promise.resolve([]),
    awayExtId ? fetchCS2TeamMatchesByExternalId(awayExtId, 20) : Promise.resolve([]),
  ]);

  const combined = homeMatches.concat(awayMatches);

  const homeId = match.homeTeam?.id ?? "";
  const awayId = match.awayTeam?.id ?? "";

  const homeForm = getTeamForm(homeId, homeMatches, 10);
  const awayForm = getTeamForm(awayId, awayMatches, 10);
  const h2h = getHeadToHead(homeId, awayId, combined);
  const homeMaps = getMapWinrates(homeId, homeMatches);
  const awayMaps = getMapWinrates(awayId, awayMatches);
  const homeRecent = getRecentMatches(homeId, homeMatches, 5);
  const awayRecent = getRecentMatches(awayId, awayMatches, 5);

  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Match header */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
        {/* Tournament label */}
        <div className="text-[10px] text-[#374151] uppercase tracking-wider mb-3">
          {match.tournament.leagueName ?? match.tournament.name}
          {match.tournament.serieName ? ` · ${match.tournament.serieName}` : ""}
          {" · "}Bo{match.numberOfGames}
        </div>

        {/* Teams + score */}
        <div className="flex items-center gap-4">
          <TeamBlock
            team={match.homeTeam}
            isWinner={isCompleted && match.winnerId === match.homeTeam?.id}
            isLoser={isCompleted && match.winnerId !== undefined && match.winnerId !== match.homeTeam?.id}
            align="left"
          />

          <div className="shrink-0 text-center min-w-[80px]">
            {isLive || isCompleted ? (
              <div className="text-3xl font-black text-white tabular-nums leading-none">
                {match.score?.home ?? 0}
                <span className="text-[#1e293b] mx-1">–</span>
                {match.score?.away ?? 0}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-sm text-[#374151]">vs</div>
                {match.scheduledAt && (
                  <div className="text-xs text-[#3B82F6]">
                    {formatKickoff(match.scheduledAt)}
                  </div>
                )}
              </div>
            )}
            <div className="mt-1.5 flex justify-center">
              <CS2StatusBadge status={match.status} />
            </div>
          </div>

          <TeamBlock
            team={match.awayTeam}
            isWinner={isCompleted && match.winnerId === match.awayTeam?.id}
            isLoser={isCompleted && match.winnerId !== undefined && match.winnerId !== match.awayTeam?.id}
            align="right"
          />
        </div>

        {/* Map scores */}
        {match.maps && match.maps.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1e293b]">
            <div className="text-[10px] text-[#374151] uppercase tracking-wider mb-2">Maps</div>
            <div className="flex gap-2 flex-wrap">
              {match.maps.map((map, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-[#111827] border border-[#1e293b] rounded px-3 py-1.5"
                >
                  <span className="text-xs text-[#94a3b8]">{map.name}</span>
                  {map.completed && (
                    <span className="text-xs font-bold text-white tabular-nums">
                      {map.homeScore}–{map.awayScore}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* H2H */}
      <HeadToHeadSection
        h2h={h2h}
        homeTeamName={match.homeTeam?.name ?? "Home"}
        awayTeamName={match.awayTeam?.name ?? "Away"}
      />

      {/* Form comparison */}
      <TeamFormComparison
        homeForm={homeForm}
        awayForm={awayForm}
        homeTeamName={match.homeTeam?.name ?? "Home"}
        awayTeamName={match.awayTeam?.name ?? "Away"}
      />

      {/* Map pool comparison */}
      <MapPoolComparison
        homeMaps={homeMaps}
        awayMaps={awayMaps}
        homeTeamName={match.homeTeam?.acronym ?? match.homeTeam?.name ?? "Home"}
        awayTeamName={match.awayTeam?.acronym ?? match.awayTeam?.name ?? "Away"}
      />

      {/* Recent results — two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RecentMatchesSection entries={homeRecent} />
        <RecentMatchesSection entries={awayRecent} />
      </div>

      {/* Rosters */}
      {(match.homeTeam?.players?.length || match.awayTeam?.players?.length) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RosterPanel team={match.homeTeam} />
          <RosterPanel team={match.awayTeam} />
        </div>
      ) : null}
    </div>
  );
}

function TeamBlock({
  team,
  isWinner,
  isLoser,
  align,
}: {
  team: EsportsTeam | null;
  isWinner: boolean;
  isLoser: boolean;
  align: "left" | "right";
}) {
  const isRight = align === "right";
  const opacity = isLoser ? "opacity-40" : "";
  return (
    <div
      className={`flex-1 flex items-center gap-3 min-w-0 ${isRight ? "flex-row-reverse" : ""} ${opacity}`}
    >
      <TeamLogo team={team} />
      <div className={`min-w-0 ${isRight ? "text-right" : ""}`}>
        <div className="text-sm font-bold text-white truncate">{team?.name ?? "TBD"}</div>
        {isWinner && (
          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">Winner</div>
        )}
      </div>
    </div>
  );
}

function TeamLogo({ team }: { team: EsportsTeam | null }) {
  if (team?.imageUrl) {
    return <img src={team.imageUrl} alt="" className="w-10 h-10 object-contain shrink-0" />;
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-[#1e293b] flex items-center justify-center shrink-0">
      <span className="text-[10px] text-[#4B5563] font-bold">
        {team?.acronym?.slice(0, 3) ?? "TBD"}
      </span>
    </div>
  );
}

function RosterPanel({ team }: { team: EsportsTeam | null }) {
  if (!team?.players?.length) return null;
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1e293b] flex items-center gap-2">
        <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
          {team.name}
        </span>
        <span className="text-[10px] text-[#1e293b]">Roster</span>
      </div>
      <div className="px-4">
        {team.players.map((p) => (
          <CS2RosterRow key={p.id} player={p} />
        ))}
      </div>
    </div>
  );
}
