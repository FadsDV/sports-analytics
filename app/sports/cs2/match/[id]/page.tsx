/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchCS2Match,
  fetchCS2TeamMatches,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import CS2StatusBadge from "@/components/cs2/CS2StatusBadge";
import CS2MapScore from "@/components/cs2/CS2MapScore";
import CS2MatchCard from "@/components/cs2/CS2MatchCard";
import CS2RosterRow from "@/components/cs2/CS2RosterRow";
import type { EsportsTeam } from "@/lib/esports/types";
import { formatKickoffFull } from "@/lib/utils";

export const revalidate = 30;

export default async function CS2MatchPage({
  params,
}: {
  params: { id: string };
}) {
  if (!hasAPIKey()) {
    return (
      <div className="max-w-3xl px-4 pt-10 pb-10 mx-auto">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-6 text-center">
          <p className="text-sm text-[#4B5563]">
            PandaScore API key required. Add <code className="text-[#9CA3AF]">PANDASCORE_API_KEY</code> to{" "}
            <code className="text-[#9CA3AF]">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  const match = await fetchCS2Match(params.id);
  if (!match) notFound();

  const { homeTeam, awayTeam, status, score, tournament, scheduledAt, numberOfGames, maps, winnerId } = match;

  const isLive     = status === "live";
  const isDone     = status === "completed";
  const showScore  = isLive || isDone;

  // Fetch recent matches for both teams in parallel
  const homeSlug = homeTeam?.id.replace(/^cs2\./, "") ?? "";
  const awaySlug = awayTeam?.id.replace(/^cs2\./, "") ?? "";

  const [homeRecent, awayRecent] = await Promise.all([
    homeSlug ? fetchCS2TeamMatches(homeSlug, 5) : Promise.resolve([]),
    awaySlug ? fetchCS2TeamMatches(awaySlug, 5) : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl px-4 pt-4 pb-10 mx-auto">

      {/* Back */}
      <Link
        href="/sports/cs2"
        className="inline-flex items-center gap-1 text-xs text-[#374151] hover:text-[#9CA3AF] mb-4 transition-colors"
      >
        ← CS2
      </Link>

      {/* ── Hero ── */}
      <div className="bg-[#111827] rounded-2xl overflow-hidden mb-4">

        {/* Tournament bar */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/5">
          <span className="text-xs text-[#4B5563] truncate flex-1">
            {tournament.leagueName ?? tournament.name}
            {tournament.serieName ? ` · ${tournament.serieName}` : ""}
          </span>
          <span className="text-[10px] text-[#374151]">Bo{numberOfGames}</span>
          <div className="ml-2">
            <CS2StatusBadge status={status} />
          </div>
        </div>

        {/* Teams + score */}
        <div className="px-5 py-6 flex items-center gap-4">
          <TeamHero team={homeTeam} winnerId={winnerId} />

          <div className="flex-1 text-center">
            {showScore ? (
              <div className="text-4xl font-black tabular-nums text-white leading-none">
                {score?.home ?? 0}
                <span className="text-[#1e293b] mx-2 font-light">–</span>
                {score?.away ?? 0}
              </div>
            ) : (
              <div>
                <div className="text-lg text-[#374151] font-light mb-1">vs</div>
                {scheduledAt && (
                  <div className="text-xs text-[#9CA3AF]">
                    {formatKickoffFull(scheduledAt)}
                  </div>
                )}
              </div>
            )}
          </div>

          <TeamHero team={awayTeam} winnerId={winnerId} mirror />
        </div>

        {/* Map scores */}
        {maps && maps.length > 0 && (
          <div className="px-5 pb-5 border-t border-white/[0.04] pt-4">
            <CS2MapScore
              maps={maps}
              bestOf={numberOfGames}
              homeTeamId={homeTeam?.id}
              awayTeamId={awayTeam?.id}
            />
          </div>
        )}
      </div>

      {/* ── Odds placeholder ── */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-wider">
            Odds
          </span>
          <span className="text-[9px] text-[#1e293b] bg-[#1e293b] px-1.5 py-0.5 rounded">
            Coming soon
          </span>
        </div>
        <p className="text-[11px] text-[#1e3a5f]">
          Odds integration will be available in a future update.
        </p>
      </div>

      {/* ── Recent matches + Rosters ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Home team panel */}
        <TeamPanel team={homeTeam} recentMatches={homeRecent} />

        {/* Away team panel */}
        <TeamPanel team={awayTeam} recentMatches={awayRecent} />
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamHero({
  team,
  winnerId,
  mirror,
}: {
  team: EsportsTeam | null;
  winnerId?: string;
  mirror?: boolean;
}) {
  const isWinner = team && winnerId && team.id === winnerId;
  return (
    <div className={`flex-1 flex flex-col items-center gap-2 text-center min-w-0 ${mirror ? "" : ""}`}>
      {team?.imageUrl ? (
        <img
          src={team.imageUrl}
          alt={team.name}
          className={`w-14 h-14 sm:w-16 sm:h-16 object-contain ${!isWinner && winnerId ? "opacity-40" : ""}`}
        />
      ) : (
        <div className="w-14 h-14 rounded-lg bg-[#1e293b] flex items-center justify-center">
          <span className="text-sm text-[#4B5563] font-bold">
            {team?.acronym?.slice(0, 3) ?? "TBD"}
          </span>
        </div>
      )}
      <div>
        <div className="font-bold text-white text-sm leading-tight">
          {team?.name ?? "TBD"}
        </div>
        {isWinner && (
          <div className="text-[9px] text-[#22C55E] mt-0.5 uppercase tracking-wider">
            Winner
          </div>
        )}
      </div>
    </div>
  );
}

function TeamPanel({
  team,
  recentMatches,
}: {
  team: EsportsTeam | null;
  recentMatches: Awaited<ReturnType<typeof fetchCS2TeamMatches>>;
}) {
  if (!team) return null;
  const teamSlug = team.id.replace(/^cs2\./, "");

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
      {/* Team header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#1e293b]">
        {team.imageUrl ? (
          <img src={team.imageUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded bg-[#1e293b] flex items-center justify-center shrink-0">
            <span className="text-[7px] text-[#4B5563] font-bold">
              {team.acronym.slice(0, 3)}
            </span>
          </div>
        )}
        <Link
          href={`/sports/cs2/team/${teamSlug}`}
          className="text-xs font-semibold text-white hover:text-[#3B82F6] transition-colors truncate"
        >
          {team.name}
        </Link>
      </div>

      {/* Roster preview */}
      {team.players && team.players.length > 0 && (
        <div className="px-3 pb-1">
          <div className="text-[9px] text-[#374151] uppercase tracking-wider pt-2.5 pb-1">
            Roster
          </div>
          {team.players.slice(0, 5).map(p => (
            <CS2RosterRow key={p.id} player={p} />
          ))}
        </div>
      )}

      {/* Recent matches */}
      {recentMatches.length > 0 && (
        <div className="px-3 pt-2 pb-3">
          <div className="text-[9px] text-[#374151] uppercase tracking-wider mb-2">
            Recent
          </div>
          <div className="flex flex-col gap-1.5">
            {recentMatches.slice(0, 3).map(m => (
              <CS2MatchCard key={m.id} match={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
