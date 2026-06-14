/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchCS2Match,
  fetchCS2TeamMatchesByExternalId,
  hasAPIKey,
} from "@/lib/sports/cs2/client";
import {
  getHeadToHead,
  getMapWinrates,
  getRecentMatches,
} from "@/lib/esports/analytics";
import { fetchHLTVMatchCache } from "@/lib/sports/cs2/hltv-client";
import CS2StatusBadge from "@/components/cs2/CS2StatusBadge";
import CS2RosterRow from "@/components/cs2/CS2RosterRow";
import { formatKickoff } from "@/lib/utils";
import type { EsportsTeam, CS2Stream } from "@/lib/esports/types";
import type { MapWinrate, FormEntry, HeadToHead } from "@/lib/esports/analytics/types";

export const revalidate = 30;

// ─── Inline SVG Radar ─────────────────────────────────────────────────────────

const CS2_MAPS = ["Dust2", "Mirage", "Inferno", "Nuke", "Overpass", "Ancient", "Anubis"];

function MapRadar({ homeMaps, awayMaps }: { homeMaps: MapWinrate[]; awayMaps: MapWinrate[] }) {
  const N = CS2_MAPS.length;
  const CX = 110, CY = 110, R = 80;
  const angles = CS2_MAPS.map((_, i) => (i / N) * 2 * Math.PI - Math.PI / 2);

  function getPoints(maps: MapWinrate[]) {
    return CS2_MAPS.map((name, i) => {
      const m = maps.find(x => x.mapName.toLowerCase().includes(name.toLowerCase()));
      const hasData = !!m;
      const rate = hasData ? m.winRate : 0;
      return {
        x: CX + R * (hasData ? rate : 0.5) * Math.cos(angles[i]),
        y: CY + R * (hasData ? rate : 0.5) * Math.sin(angles[i]),
      };
    });
  }

  const homePts = getPoints(homeMaps);
  const awayPts = getPoints(awayMaps);
  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  const rings = [0.25, 0.5, 0.75, 1.0].map(pct => {
    const pts = CS2_MAPS.map((_, i) => ({
      x: CX + R * pct * Math.cos(angles[i]),
      y: CY + R * pct * Math.sin(angles[i]),
    }));
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
  });

  return (
    <svg viewBox="0 0 220 220" className="w-full max-w-[220px] mx-auto">
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.75" />
      ))}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={CX}
          y1={CY}
          x2={(CX + R * Math.cos(a)).toFixed(1)}
          y2={(CY + R * Math.sin(a)).toFixed(1)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.75"
        />
      ))}
      <path d={toPath(homePts)} fill="rgba(59,130,246,0.25)" stroke="#3B82F6" strokeWidth="1.5" />
      <path d={toPath(awayPts)} fill="rgba(148,163,184,0.15)" stroke="#94a3b8" strokeWidth="1.5" />
      {CS2_MAPS.map((name, i) => {
        const labelR = R + 22;
        const x = CX + labelR * Math.cos(angles[i]);
        const y = CY + labelR * Math.sin(angles[i]);
        return (
          <text
            key={name}
            x={x.toFixed(1)}
            y={y.toFixed(1)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(148,163,184,0.8)"
            fontSize="8"
          >
            {name}
          </text>
        );
      })}
      <rect x="10" y="200" width="8" height="3" fill="#3B82F6" />
      <rect x="10" y="207" width="8" height="3" fill="#94a3b8" />
    </svg>
  );
}

// ─── Map badge colors ─────────────────────────────────────────────────────────

const MAP_COLORS: Record<string, string> = {
  Dust2:    "#e8c55e",
  Mirage:   "#a855f7",
  Inferno:  "#f97316",
  Nuke:     "#ef4444",
  Overpass: "#3b82f6",
  Ancient:  "#22c55e",
  Anubis:   "#ec4899",
};

function mapBadgeColor(name: string): string {
  for (const [key, color] of Object.entries(MAP_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#374151";
}

// ─── Language → flag ─────────────────────────────────────────────────────────

const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧",
  ru: "🇷🇺",
  uk: "🇺🇦",
  tr: "🇹🇷",
  pt: "🇧🇷",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  ko: "🇰🇷",
  bg: "🇧🇬",
};

function langFlag(lang: string): string {
  return LANG_FLAGS[lang.toLowerCase()] ?? "🌐";
}

function channelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\//, "").split("/");
    return parts[0] || url;
  } catch {
    return url;
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function filterRecent90Days(entries: FormEntry[]): FormEntry[] {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return entries.filter(e => {
    if (!e.date) return false;
    return new Date(e.date).getTime() >= cutoff;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamLogo({ team, size = 80 }: { team: EsportsTeam | null; size?: number }) {
  const sz = `${size}px`;
  if (team?.imageUrl) {
    return (
      <img
        src={team.imageUrl}
        alt=""
        style={{ width: sz, height: sz }}
        className="object-contain shrink-0"
      />
    );
  }
  return (
    <div
      style={{ width: sz, height: sz }}
      className="rounded-xl bg-[#1e293b] flex items-center justify-center shrink-0"
    >
      <span className="text-sm text-[#4B5563] font-bold">
        {team?.acronym?.slice(0, 3) ?? "TBD"}
      </span>
    </div>
  );
}

function RosterPanel({ team }: { team: EsportsTeam | null }) {
  if (!team?.players?.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
        <span className="text-[10px] font-semibold text-[var(--color-text-2)] uppercase tracking-widest">
          {team.name}
        </span>
      </div>
      <div className="px-4">
        {team.players.map(p => (
          <CS2RosterRow key={p.id} player={p} />
        ))}
      </div>
    </div>
  );
}

function WatchSection({ streams }: { streams: CS2Stream[] }) {
  if (!streams.length) return null;
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
        <span className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-widest">
          Watch
        </span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {streams.map((s, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-lg leading-none" aria-label={s.language}>
              {langFlag(s.language)}
            </span>
            <span className="flex-1 text-sm text-[var(--color-text-1)] font-medium">
              {channelFromUrl(s.rawUrl)}
            </span>
            {(s.official || s.main) && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6] font-semibold uppercase tracking-wider">
                {s.official ? "Official" : "Main"}
              </span>
            )}
            <a
              href={s.rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--color-primary)] hover:underline shrink-0"
            >
              Watch →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PandaScore Analytics ─────────────────────────────────────────────────────

function MapStatsTable({
  homeMaps,
  awayMaps,
  homeName,
  awayName,
}: {
  homeMaps: MapWinrate[];
  awayMaps: MapWinrate[];
  homeName: string;
  awayName: string;
}) {
  const allMapNames = Array.from(
    new Set([...homeMaps.map(m => m.mapName), ...awayMaps.map(m => m.mapName)]),
  );

  if (allMapNames.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-2)] px-4 py-3">
        Map data available after matches are fetched individually.
      </p>
    );
  }

  return (
    <div>
      {/* Header row */}
      <div className="grid grid-cols-[1fr_120px_1fr] gap-1 px-3 py-1.5 text-[10px] text-[var(--color-text-2)] uppercase tracking-wider border-b border-[var(--color-border)]">
        <span>{homeName}</span>
        <span className="text-center">Map</span>
        <span className="text-right">{awayName}</span>
      </div>
      {allMapNames.map(name => {
        const hm = homeMaps.find(x => x.mapName === name);
        const am = awayMaps.find(x => x.mapName === name);
        const hPct = hm ? Math.round(hm.winRate * 100) : null;
        const aPct = am ? Math.round(am.winRate * 100) : null;
        const color = mapBadgeColor(name);

        return (
          <div
            key={name}
            className="grid grid-cols-[1fr_120px_1fr] gap-1 px-3 py-2.5 border-b border-[var(--color-border)] last:border-0 items-center"
          >
            {/* Home side */}
            <div className="text-left">
              <div className="text-sm font-semibold text-[var(--color-text-1)]">
                {hPct !== null ? `${hPct}%` : "—"}
              </div>
              {hm && (
                <div className="text-[10px] text-[var(--color-text-2)]">
                  {hm.totalPlayed} maps
                </div>
              )}
            </div>
            {/* Map badge */}
            <div className="flex justify-center">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: color }}
              >
                {name}
              </span>
            </div>
            {/* Away side */}
            <div className="text-right">
              <div className="text-sm font-semibold text-[var(--color-text-1)]">
                {aPct !== null ? `${aPct}%` : "—"}
              </div>
              {am && (
                <div className="text-[10px] text-[var(--color-text-2)]">
                  {am.totalPlayed} maps
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentMatchRow({ entry }: { entry: FormEntry }) {
  const isWin = entry.result === "W";
  return (
    <div className="py-2 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-[var(--color-text-1)] truncate">
          {entry.opponentName}
        </span>
        <span className="text-[10px] text-[var(--color-text-2)] shrink-0">
          Bo{entry.seriesScore.team + entry.seriesScore.opponent}
        </span>
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${
            isWin
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {entry.seriesScore.team}-{entry.seriesScore.opponent}
        </span>
      </div>
      <div className="text-[10px] text-[var(--color-text-2)] truncate mt-0.5">
        {entry.tournament}
      </div>
    </div>
  );
}

function H2HTable({
  h2h,
  homeTeamName,
  awayTeamName,
  hltvSource = false,
}: {
  h2h: HeadToHead;
  homeTeamName: string;
  awayTeamName: string;
  hltvSource?: boolean;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface2)] flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-widest">
          Head to Head
        </span>
        {hltvSource && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase tracking-wider">
            HLTV
          </span>
        )}
      </div>

      {h2h.total === 0 ? (
        <p className="text-xs text-[var(--color-text-2)] px-4 py-3">
          No historical meetings in current sample.
        </p>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-[var(--color-border)] text-center">
            <div>
              <div className="text-xl font-black text-[var(--color-text-1)]">{h2h.teamAWins}</div>
              <div className="text-[10px] text-[var(--color-text-2)] truncate">{homeTeamName}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--color-text-2)] mt-2">{h2h.total} meetings</div>
            </div>
            <div>
              <div className="text-xl font-black text-[var(--color-text-1)]">{h2h.teamBWins}</div>
              <div className="text-[10px] text-[var(--color-text-2)] truncate">{awayTeamName}</div>
            </div>
          </div>

          {/* Match rows */}
          <div className="divide-y divide-[var(--color-border)]">
            {h2h.entries.slice(0, 8).map(entry => {
              const aIsHome = entry.homeTeamId === h2h.teamAId;
              const aWon = entry.winnerId === h2h.teamAId;
              const bWon = entry.winnerId === h2h.teamBId;
              const homeScore = aIsHome
                ? entry.seriesScore.home
                : entry.seriesScore.away;
              const awayScore = aIsHome
                ? entry.seriesScore.away
                : entry.seriesScore.home;

              return (
                <div
                  key={entry.matchId}
                  className="grid grid-cols-[60px_1fr_30px_1fr_80px] gap-1 px-3 py-2 items-center text-xs"
                >
                  <span className="text-[10px] text-[var(--color-text-2)]">
                    {fmtDate(entry.date)}
                  </span>
                  <span
                    className={`truncate ${
                      aWon
                        ? "font-semibold text-[var(--color-text-1)]"
                        : "text-[var(--color-text-2)]"
                    }`}
                  >
                    {homeTeamName}
                  </span>
                  <span className="text-center font-bold tabular-nums text-[var(--color-text-1)]">
                    {homeScore}–{awayScore}
                  </span>
                  <span
                    className={`truncate text-right ${
                      bWon
                        ? "font-semibold text-[var(--color-text-1)]"
                        : "text-[var(--color-text-2)]"
                    }`}
                  >
                    {awayTeamName}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-2)] truncate text-right">
                    {entry.tournament}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CS2MatchPage({ params }: { params: { id: string } }) {
  if (!hasAPIKey()) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-[var(--color-text-2)]">PANDASCORE_API_KEY not configured.</p>
      </div>
    );
  }

  const match = await fetchCS2Match(params.id);
  if (!match) notFound();

  const homeExtId = match.homeTeam?.externalId;
  const awayExtId = match.awayTeam?.externalId;
  const homeId = match.homeTeam?.id ?? "";
  const awayId = match.awayTeam?.id ?? "";

  // Try HLTV cache first (uploaded by local scraper via scripts/scrape-hltv.mjs)
  const hltvData = await fetchHLTVMatchCache(match.id);

  // Fetch PandaScore team history for recent form (always needed)
  const [homeMatches, awayMatches] = await Promise.all([
    homeExtId ? fetchCS2TeamMatchesByExternalId(homeExtId, 20) : Promise.resolve([]),
    awayExtId ? fetchCS2TeamMatchesByExternalId(awayExtId, 20) : Promise.resolve([]),
  ]);

  // Map stats: HLTV cache preferred (has real per-map data), PandaScore fallback
  const homeMaps = hltvData?.homeTeam.mapStats ?? getMapWinrates(homeId, homeMatches);
  const awayMaps = hltvData?.awayTeam.mapStats ?? getMapWinrates(awayId, awayMatches);

  // H2H: HLTV cache preferred (full historical record), PandaScore fallback
  const combined = homeMatches.concat(awayMatches);
  const h2h = hltvData?.h2h ?? getHeadToHead(homeId, awayId, combined);

  // Recent form: always from PandaScore (has full match context)
  const homeRecentRaw = getRecentMatches(homeId, homeMatches, 20);
  const awayRecentRaw = getRecentMatches(awayId, awayMatches, 20);
  const homeRecent = filterRecent90Days(homeRecentRaw);
  const awayRecent = filterRecent90Days(awayRecentRaw);

  // Rankings from HLTV (not available in PandaScore)
  const homeRank = hltvData?.homeTeam.rank ?? null;
  const awayRank = hltvData?.awayTeam.rank ?? null;

  // ─── Derive display values ─────────────────────────────────────────────────

  const isCompleted = match.status === "completed";
  const isLive = match.status === "live";
  const isUpcoming = !isCompleted && !isLive;

  const streams = match.streams ?? [];

  const team1Name = match.homeTeam?.name ?? "TBD";
  const team2Name = match.awayTeam?.name ?? "TBD";

  const tournamentLabel = [
    match.tournament.leagueName ?? match.tournament.name,
    match.tournament.serieName,
    `Bo${match.numberOfGames}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--color-text-2)] flex gap-1.5 items-center flex-wrap">
        <Link href="/sports/cs2" className="hover:text-[var(--color-primary)]">
          CS2
        </Link>
        <span>/</span>
        <span className="truncate max-w-[200px]">
          {match.tournament.leagueName ?? match.tournament.name}
        </span>
        <span>/</span>
        <span className="text-[var(--color-text-1)]">
          {team1Name} vs {team2Name}
        </span>
      </nav>

      {/* ─── HERO CARD ─────────────────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
        {/* Tournament bar */}
        <div className="bg-[var(--color-surface2)] px-4 py-2 text-[11px] text-[var(--color-text-2)] tracking-wide">
          {tournamentLabel}
        </div>

        {/* Teams + score */}
        <div className="flex items-center justify-between gap-4 px-6 py-6">
          {/* Team 1 */}
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <TeamLogo team={match.homeTeam} size={80} />
            <div className="flex flex-col items-center gap-0.5 min-w-0">
              <span
                className={`text-base font-bold truncate max-w-full ${
                  isCompleted && match.winnerId === match.homeTeam?.id
                    ? "text-[var(--color-text-1)]"
                    : isCompleted
                    ? "text-[var(--color-text-2)] opacity-60"
                    : "text-[var(--color-text-1)]"
                }`}
              >
                {team1Name}
              </span>
              {homeRank && (
                <span className="text-[10px] text-[var(--color-text-2)]">
                  #{homeRank} World
                </span>
              )}
            </div>
          </div>

          {/* Score / upcoming */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            {isLive || isCompleted ? (
              <div className="flex items-center gap-2">
                <span className="text-5xl font-black text-[var(--color-text-1)] tabular-nums">
                  {match.score?.home ?? 0}
                </span>
                <span className="text-2xl text-[var(--color-text-2)] opacity-40">–</span>
                <span className="text-5xl font-black text-[var(--color-text-1)] tabular-nums">
                  {match.score?.away ?? 0}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm text-[var(--color-text-2)]">vs</span>
                {match.scheduledAt && (
                  <span className="text-sm text-[var(--color-primary)] font-medium">
                    {formatKickoff(match.scheduledAt)}
                  </span>
                )}
              </div>
            )}
            <CS2StatusBadge status={match.status} />
          </div>

          {/* Team 2 */}
          <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
            <TeamLogo team={match.awayTeam} size={80} />
            <div className="flex flex-col items-center gap-0.5 min-w-0">
              <span
                className={`text-base font-bold truncate max-w-full ${
                  isCompleted && match.winnerId === match.awayTeam?.id
                    ? "text-[var(--color-text-1)]"
                    : isCompleted
                    ? "text-[var(--color-text-2)] opacity-60"
                    : "text-[var(--color-text-1)]"
                }`}
              >
                {team2Name}
              </span>
              {awayRank && (
                <span className="text-[10px] text-[var(--color-text-2)]">
                  #{awayRank} World
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Map score pills (PandaScore) */}
        {match.maps && match.maps.length > 0 && (
          <div className="px-6 pb-5 flex gap-2 flex-wrap justify-center">
            {match.maps.map((map, i) => {
              const homeWon = map.completed && map.winnerId === match.homeTeam?.id;
              const awayWon = map.completed && map.winnerId === match.awayTeam?.id;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg px-3 py-1.5"
                >
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: mapBadgeColor(map.name), color: "#fff" }}
                  >
                    {map.name}
                  </span>
                  {map.completed ? (
                    <span className="text-xs tabular-nums font-medium">
                      <span className={homeWon ? "text-[var(--color-text-1)]" : "text-[var(--color-text-2)] opacity-50"}>
                        {map.homeScore}
                      </span>
                      <span className="text-[var(--color-text-2)] mx-0.5">–</span>
                      <span className={awayWon ? "text-[var(--color-text-1)]" : "text-[var(--color-text-2)] opacity-50"}>
                        {map.awayScore}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--color-text-2)]">TBP</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── PANDASCORE WATCH SECTION ─────────────────────────────────────────── */}
      {!isUpcoming && streams.length > 0 && (
        <WatchSection streams={streams} />
      )}

      {/* ─── 2-COLUMN GRID (PandaScore analytics) ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          {/* Map stats */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface2)] flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-widest">
                Map Stats
              </span>
              {hltvData && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase tracking-wider">
                  HLTV · 90 days
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-border)]">
              {/* Radar chart */}
              <div className="flex items-center justify-center p-4">
                <MapRadar homeMaps={homeMaps} awayMaps={awayMaps} />
              </div>
              {/* Table */}
              <div>
                <MapStatsTable
                  homeMaps={homeMaps}
                  awayMaps={awayMaps}
                  homeName={match.homeTeam?.acronym ?? match.homeTeam?.name ?? "Home"}
                  awayName={match.awayTeam?.acronym ?? match.awayTeam?.name ?? "Away"}
                />
              </div>
            </div>
          </div>

          {/* Recent matches — past 3 months */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface2)]">
              <span className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-widest">
                Matches — past 3 months
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--color-border)]">
              {/* Home recent */}
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-[var(--color-text-1)] mb-2">
                  {match.homeTeam?.name ?? "Home"}
                </div>
                {homeRecent.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-2)]">No results in last 90 days.</p>
                ) : (
                  homeRecent.slice(0, 10).map(e => (
                    <RecentMatchRow key={e.matchId} entry={e} />
                  ))
                )}
              </div>
              {/* Away recent */}
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-[var(--color-text-1)] mb-2">
                  {match.awayTeam?.name ?? "Away"}
                </div>
                {awayRecent.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-2)]">No results in last 90 days.</p>
                ) : (
                  awayRecent.slice(0, 10).map(e => (
                    <RecentMatchRow key={e.matchId} entry={e} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* H2H — HLTV preferred, PandaScore fallback */}
          <H2HTable
            h2h={h2h}
            homeTeamName={match.homeTeam?.name ?? "Home"}
            awayTeamName={match.awayTeam?.name ?? "Away"}
            hltvSource={!!hltvData?.h2h}
          />

          {/* Rosters (PandaScore) */}
          {(match.homeTeam?.players?.length || match.awayTeam?.players?.length) ? (
            <div className="space-y-4">
              <RosterPanel team={match.homeTeam} />
              <RosterPanel team={match.awayTeam} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
