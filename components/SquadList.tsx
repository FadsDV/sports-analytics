/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import { Sport } from "@/lib/types";

// ─── Injury badge colours ───────────────────────────────────────────────────

const INJURY_COLORS: Record<string, string> = {
  Out:          "bg-red-900/50 text-red-400 border-red-800/60",
  Doubtful:     "bg-orange-900/50 text-orange-400 border-orange-800/60",
  Questionable: "bg-yellow-900/50 text-yellow-400 border-yellow-800/60",
  Probable:     "bg-blue-900/40 text-blue-400 border-blue-800/50",
  Suspended:    "bg-purple-900/50 text-purple-400 border-purple-800/60",
};

// ─── Position grouping (per sport) ─────────────────────────────────────────

function positionRank(sport: Sport, pos: string): number {
  const p = pos.toUpperCase();

  if (sport === "basketball") {
    if (["PG", "SG", "G"].includes(p))  return 0;
    if (p === "SF")                       return 1;
    if (p === "PF")                       return 2;
    if (p === "C")                        return 3;
    return 4;
  }

  if (sport === "nfl") {
    if (p === "QB")                                     return 0;
    if (["RB", "FB", "HB"].includes(p))                return 1;
    if (["WR", "TE"].includes(p))                      return 2;
    if (["OT", "OG", "OC", "OL", "C"].includes(p))   return 3;
    if (["DE", "DT", "NT", "DL"].includes(p))          return 4;
    if (["LB", "ILB", "OLB", "MLB"].includes(p))       return 5;
    if (["CB", "FS", "SS", "DB", "S"].includes(p))     return 6;
    return 7;
  }

  // Soccer / AFL / fallback
  if (["GK", "G"].includes(p))                                         return 0;
  if (["CB", "LB", "RB", "LWB", "RWB", "SW", "D", "DF"].includes(p)) return 1;
  if (["CDM", "CM", "CAM", "LM", "RM", "MF", "M", "AM", "DM"].includes(p)) return 2;
  if (["LW", "RW", "ST", "CF", "SS", "FW", "F", "ATT"].includes(p))  return 3;
  return 4;
}

function getGroupLabel(sport: Sport, rank: number): string {
  if (sport === "basketball") {
    return (["Guards", "Small Forwards", "Power Forwards", "Centers", "Others"] as const)[rank] ?? "Others";
  }
  if (sport === "nfl") {
    return (["Quarterbacks", "Running Backs", "Receivers", "Offensive Line",
             "Defensive Line", "Linebackers", "Defensive Backs", "Specialists"] as const)[rank] ?? "Others";
  }
  return (["Goalkeepers", "Defenders", "Midfielders", "Forwards", "Others"] as const)[rank] ?? "Others";
}

// ─── Helper: best 1 key stat to show inline ─────────────────────────────────

const KEY_STAT_PRIORITY = ["PTS", "G", "goals", "YDS", "REC", "SV", "TKL", "AST", "assists", "REB"];

function firstKeyStat(stats: Record<string, string | number>): string | null {
  for (const k of KEY_STAT_PRIORITY) {
    if (stats[k] != null && stats[k] !== "—") return `${k} ${stats[k]}`;
  }
  const first = Object.entries(stats).find(([, v]) => v !== "—" && v !== "");
  return first ? `${first[0]} ${first[1]}` : null;
}

// ─── Sub-component: single player row ───────────────────────────────────────

function PlayerRow({
  player,
  injury,
  sport,
  gameId,
}: {
  player: ESPNPlayer;
  injury:  ESPNInjury | undefined;
  sport:   Sport;
  gameId?: string;
}) {
  console.info("[SportsPulse] PlayerRow route", {
    sport,
    gameId: gameId ?? null,
    playerId: player.id ?? null,
    playerName: player.displayName,
  });

  const badgeCls = injury?.status
    ? (INJURY_COLORS[injury.status] ?? INJURY_COLORS.Questionable)
    : null;

  const keyStat = firstKeyStat(player.seasonStats);
  const initials = player.displayName
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const href = player.id
    ? `/player/${sport}/${player.id}${gameId ? `?from=${gameId}` : ""}`
    : "#";

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-[#1e293b]/70 transition-colors group"
    >
      {/* Headshot circle */}
      <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-[#1e293b] flex items-center justify-center">
        <span className="text-[10px] font-bold text-gray-500 select-none">{initials}</span>
        {player.headshot && (
          <img
            src={player.headshot}
            alt={player.displayName}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>

      {/* Jersey number */}
      {player.jersey && (
        <span className="text-[11px] text-gray-600 font-mono w-5 shrink-0 text-right">
          {player.jersey}
        </span>
      )}

      {/* Name + injury */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-sm font-medium truncate transition-colors ${
              injury?.status === "Out" || injury?.status === "Suspended"
                ? "text-gray-500 line-through"
                : "text-white group-hover:text-[#4361ee]"
            }`}
          >
            {player.displayName}
          </span>
          {badgeCls && injury?.status && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-px rounded border shrink-0 ${badgeCls}`}
            >
              {injury.status}
            </span>
          )}
        </div>
        {injury?.note && (
          <div className="text-[11px] text-gray-600 truncate">{injury.note}</div>
        )}
      </div>

      {/* Position + key stat */}
      <div className="shrink-0 text-right">
        <div className="text-xs font-semibold text-gray-500">{player.position}</div>
        {keyStat && (
          <div className="text-[10px] text-gray-600 mt-0.5">{keyStat}</div>
        )}
      </div>

      <span className="text-gray-700 group-hover:text-gray-400 transition-colors ml-0.5 text-xs">
        →
      </span>
    </Link>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SquadList({
  players,
  injuries,
  sport,
  gameId,
}: {
  players:   ESPNPlayer[];
  injuries:  ESPNInjury[];
  sport:     Sport;
  gameId?:   string;
}) {
  if (players.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-2">
        Squad data not yet available for this team.
      </p>
    );
  }

  // Build injury lookup by player ID and name
  const injuryById   = new Map<string, ESPNInjury>();
  const injuryByName = new Map<string, ESPNInjury>();
  for (const inj of injuries) {
    if (inj.playerId) injuryById.set(inj.playerId, inj);
    injuryByName.set(inj.playerName.toLowerCase(), inj);
  }

  const getInjury = (p: ESPNPlayer) =>
    injuryById.get(p.id) ?? injuryByName.get(p.displayName.toLowerCase());

  // Sort players by position group
  const sorted = [...players].sort(
    (a, b) => positionRank(sport, a.position) - positionRank(sport, b.position)
  );

  // Group into position sections
  type Group = { label: string; rank: number; players: ESPNPlayer[] };
  const groups: Group[] = [];

  for (const p of sorted) {
    const rank  = positionRank(sport, p.position);
    const label = getGroupLabel(sport, rank);
    const last  = groups[groups.length - 1];

    if (!last || last.rank !== rank) {
      groups.push({ label, rank, players: [p] });
    } else {
      last.players.push(p);
    }
  }

  // Injury summary counts (for header chip)
  const outCount = injuries.filter((i) =>
    i.status === "Out" || i.status === "Suspended"
  ).length;
  const doubtfulCount = injuries.filter((i) =>
    i.status === "Doubtful" || i.status === "Questionable"
  ).length;

  return (
    <div>
      {/* Quick injury count */}
      {(outCount > 0 || doubtfulCount > 0) && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {outCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-red-900/40 text-red-400 border-red-800/60">
              {outCount} Out / Suspended
            </span>
          )}
          {doubtfulCount > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-yellow-900/40 text-yellow-400 border-yellow-800/60">
              {doubtfulCount} Doubtful / Questionable
            </span>
          )}
        </div>
      )}

      {/* Position groups */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.rank}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1 px-2">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.players.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  injury={getInjury(player)}
                  sport={sport}
                  gameId={gameId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
