/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Sport } from "@/lib/types";
import {
  fetchNormalizedPlayerData,
  NormalizedGameLog,
} from "@/lib/sports/playerData";
import { fetchPlayerProfile, fetchTeamInjuries } from "@/lib/sports/espnPlayers";
import { fetchAFLPlayerHistory } from "@/lib/sports/afl/players/history";
import { computeAFLPlayerAnalytics } from "@/lib/sports/afl/players/analytics";
import PlayerProfileContent from "@/components/afl/PlayerProfileContent";

// ─── AFL full-page profile ────────────────────────────────────────────────────

async function AFLPlayerPage({
  athleteId,
  teamId,
  homeAway,
  opponent,
  from,
}: {
  athleteId: string;
  teamId: string;
  homeAway: "home" | "away";
  opponent: string;
  from?: string;
}) {
  const backHref  = from ? `/game/${from}` : "/";
  const backLabel = from ? "← Back to Match" : "← All Games";

  const currentYear = new Date().getFullYear();
  const seasons     = [currentYear, currentYear - 1];

  let analytics = null;
  try {
    const [games, profile, injuries] = await Promise.all([
      fetchAFLPlayerHistory(teamId, athleteId, seasons),
      fetchPlayerProfile("australian-football/afl", athleteId),
      fetchTeamInjuries("australian-football/afl", teamId),
    ]);

    if (games.length > 0) {
      const playerInjury = injuries.find(
        (i) =>
          i.playerId === athleteId ||
          i.playerName.toLowerCase() === (profile?.name ?? "").toLowerCase()
      );

      analytics = computeAFLPlayerAnalytics({
        playerId:     athleteId,
        playerName:   profile?.name ?? "Unknown",
        position:     profile?.position ?? "??",
        jersey:       profile?.jersey ?? undefined,
        headshot:     profile?.headshot,
        games,
        matchContext: homeAway,
        opponent,
        seasons,
        injuryContext: playerInjury
          ? { status: playerInjury.status, note: playerInjury.note }
          : undefined,
        totalGamesScheduled: undefined,
      });
    }
  } catch (err) {
    console.error("[SportsPulse] AFLPlayerPage fetch error", err);
  }

  if (!analytics) {
    return (
      <div className="max-w-2xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white mb-5 transition-colors"
        >
          {backLabel}
        </Link>
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6">
          <h1 className="text-2xl font-black text-white mb-2">Player unavailable</h1>
          <p className="text-sm text-gray-400">
            No game data found for athlete{" "}
            <span className="text-white font-mono">{athleteId}</span>.
          </p>
        </div>
      </div>
    );
  }

  const { playerName, position, jersey, headshot, injuryContext } = analytics;

  function initials(name: string) {
    return name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white mb-5 transition-colors"
      >
        {backLabel}
      </Link>

      {/* Player header */}
      <div className="bg-[#111827] border border-[#3B82F6]/20 rounded-2xl px-6 py-5 mb-6 flex items-center gap-5">
        <div className="relative shrink-0">
          {headshot ? (
            <img
              src={headshot}
              alt={playerName}
              className="w-20 h-20 rounded-xl object-cover bg-white/5 border border-white/10"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-[#1F2937] flex items-center justify-center text-2xl font-black text-[#9CA3AF] border border-white/10">
              {initials(playerName)}
            </div>
          )}
          <div className="absolute -bottom-1 -right-1 bg-[#3B82F6] text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-lg border border-[#111827]">
            #{jersey || "—"}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              {playerName}
            </h1>
            {injuryContext && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                injuryContext.status === "Out"
                  ? "bg-red-900/40 text-red-400 border-red-800/60"
                  : "bg-yellow-900/40 text-yellow-400 border-yellow-800/60"
              }`}>
                {injuryContext.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#3B82F6] uppercase tracking-widest">{position}</span>
            {opponent && (
              <>
                <span className="w-1 h-1 rounded-full bg-[#374151]" />
                <span className="text-xs text-[#6B7280]">
                  {homeAway === "home" ? "HOME" : "AWAY"} vs {opponent}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Profile content */}
      <PlayerProfileContent data={analytics} />
    </div>
  );
}

// ─── Unavailable fallback ─────────────────────────────────────────────────────

function PlayerUnavailable({
  sport,
  athleteId,
  from,
}: {
  sport: string;
  athleteId: string;
  from?: string;
}) {
  const backHref  = from ? `/game/${from}` : "/";
  const backLabel = from ? "← Back to Match" : "← All Games";

  return (
    <div className="max-w-3xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white mb-5 transition-colors"
      >
        {backLabel}
      </Link>

      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6">
        <h1 className="text-2xl font-black text-white mb-2">Player unavailable</h1>
        <p className="text-sm text-gray-400">
          We could not load player data for{" "}
          <span className="text-white">{athleteId}</span> in{" "}
          <span className="text-white">{sport}</span>.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { sport: string; athleteId: string };
  searchParams: { from?: string; teamId?: string; homeAway?: string; opponent?: string };
}) {
  const { sport, athleteId } = params;
  const { from, teamId, homeAway, opponent } = searchParams;

  console.info("[SportsPulse] PlayerPage request", { sport, athleteId, from: from ?? null });

  // AFL: use dedicated AFL analytics pipeline
  if (sport === "afl") {
    if (!teamId) {
      return <PlayerUnavailable sport={sport} athleteId={athleteId} from={from} />;
    }
    return (
      <AFLPlayerPage
        athleteId={athleteId}
        teamId={teamId}
        homeAway={homeAway === "away" ? "away" : "home"}
        opponent={opponent ?? ""}
        from={from}
      />
    );
  }

  // Generic path for other sports
  const normalized = await fetchNormalizedPlayerData(sport as Sport, athleteId, from);
  if (!normalized) {
    console.warn("[SportsPulse] PlayerPage missing player data", { sport, athleteId });
    return <PlayerUnavailable sport={sport} athleteId={athleteId} from={from} />;
  }

  const profile = normalized;
  const gamelog = normalized.gameLogs;
  const seasonStatEntries = profile.seasonStats ? Object.entries(profile.seasonStats) : [];

  const backHref  = from ? `/game/${from}` : "/";
  const backLabel = from ? "← Back to Match" : "← All Games";

  return (
    <div className="max-w-5xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white mb-5 transition-colors"
      >
        {backLabel}
      </Link>

      {/* ── Player Header ────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl p-6 mb-4">
        <div className="flex items-start gap-5 flex-wrap sm:flex-nowrap">
          {/* Headshot */}
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[#1e293b] shrink-0 flex items-center justify-center">
            {profile.headshot ? (
              <img
                src={profile.headshot}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-3xl font-black text-gray-600">
                {profile.name
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .slice(0, 2)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {profile.team && (
              <div className="flex items-center gap-2 mb-2">
                {profile.teamLogo && (
                  <img src={profile.teamLogo} alt={profile.team} className="w-6 h-6 object-contain" />
                )}
                <span className="text-sm text-gray-400">{profile.team}</span>
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
              {profile.name}
            </h1>

            <div className="flex flex-wrap gap-2 text-sm">
              {profile.position && (
                <span className="bg-[#4361ee]/20 text-[#4361ee] px-2.5 py-1 rounded-full font-semibold text-xs">
                  {profile.positionFull ?? profile.position}
                </span>
              )}
              {profile.jersey && (
                <span className="bg-[#1e293b] text-gray-300 px-2.5 py-1 rounded-full text-xs font-mono">
                  #{profile.jersey}
                </span>
              )}
              {profile.age && (
                <span className="text-gray-500 text-xs self-center">{profile.age} yrs</span>
              )}
              {profile.nationality && (
                <span className="text-gray-500 text-xs self-center">{profile.nationality}</span>
              )}
              {profile.height && (
                <span className="text-gray-500 text-xs self-center">{profile.height}</span>
              )}
              {profile.weight && (
                <span className="text-gray-500 text-xs self-center">{profile.weight}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Season Stats ─────────────────────────────────────────────── */}
      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
          Season Stats
        </h3>
        {seasonStatEntries.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {seasonStatEntries.map(([key, value]) => (
              <div
                key={key}
                className="bg-[#111827] border border-[#1f2937] rounded-lg p-3 text-center"
              >
                <div className="text-xl font-bold text-white tabular-nums">
                  {value == null ? "No data available" : String(value)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1 uppercase tracking-widest">{key}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No data available</p>
        )}
      </div>

      {gamelog.length > 0 ? (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
            Full Season Game Log ({gamelog.length} Games)
          </h3>
          <GameLogTable gamelog={gamelog} />
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-5 text-center">
          <p className="text-sm text-gray-500">No data available</p>
        </div>
      )}
    </div>
  );
}

// ─── Game Log Table (generic sports) ─────────────────────────────────────────

function GameLogTable({ gamelog }: { gamelog: NormalizedGameLog[] }) {
  const statKeys = Array.from(new Set(gamelog.flatMap((g) => Object.keys(g.stats))));

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-[#1e293b]">
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500 whitespace-nowrap">Date</th>
            <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Opponent</th>
            <th className="text-center py-2 px-1 text-xs font-medium text-gray-500">H/A</th>
            <th className="text-center py-2 px-2 text-xs font-medium text-gray-500">Result</th>
            {statKeys.map((k) => (
              <th
                key={k}
                className="text-right py-2 px-2 text-xs font-medium text-gray-500 whitespace-nowrap"
              >
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gamelog.map((g, i) => {
            const isWin  = g.result?.startsWith("W");
            const isLoss = g.result?.startsWith("L");
            const isHome = g.homeAway === "home";

            return (
              <tr
                key={i}
                className="border-b border-[#1e293b]/50 last:border-0 hover:bg-[#1e293b]/30 transition-colors"
              >
                <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">{g.date}</td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {g.opponentLogo && (
                      <img
                        src={g.opponentLogo}
                        alt={g.opponent ?? "Opponent"}
                        className="w-4 h-4 object-contain shrink-0"
                      />
                    )}
                    <span className="text-xs text-gray-300 truncate">
                      {g.opponent ?? "No data available"}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-1 text-center">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    isHome ? "bg-blue-900/50 text-blue-400" : "bg-[#1e293b] text-gray-400"
                  }`}>
                    {g.homeAway == null ? "—" : isHome ? "H" : "A"}
                  </span>
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`text-xs font-bold ${
                    isWin ? "text-green-400" : isLoss ? "text-red-400" : "text-gray-400"
                  }`}>
                    {g.result ?? "No data available"}
                  </span>
                </td>
                {statKeys.map((k) => (
                  <td
                    key={k}
                    className="py-2 px-2 text-right text-xs text-gray-300 tabular-nums whitespace-nowrap"
                  >
                    {g.stats[k] ?? "No data available"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
