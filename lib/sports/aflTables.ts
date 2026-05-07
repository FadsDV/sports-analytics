import { BoxScore, BoxScoreRow } from "@/lib/types";

const SQUIGGLE_BASE = "https://api.squiggle.com.au";

interface AFLMatchStats {
  teamStats: Record<string, string | number | null>;
  boxScore: BoxScore | null;
}

function toRow(playerName: string, stats: Record<string, string | number | null>): BoxScoreRow {
  return {
    player: playerName,
    stats,
  };
}

/**
 * Best-effort AFL match stat fetcher.
 * 1) Uses Squiggle per-game stats when available.
 * 2) Leaves fields null when source is incomplete.
 */
export async function fetchAFLMatchStats(
  gameId: number,
  homeTeamName: string,
  awayTeamName: string
): Promise<AFLMatchStats> {
  try {
    const res = await fetch(`${SQUIGGLE_BASE}/?q=stats;game=${gameId}`, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) {
      return { teamStats: {}, boxScore: null };
    }

    const payload = await res.json();
    const rows: any[] = payload.stats ?? [];
    if (!rows.length) {
      return { teamStats: {}, boxScore: null };
    }

    const homeRows = rows.filter((r) => r.team === homeTeamName || r.hteam === homeTeamName);
    const awayRows = rows.filter((r) => r.team === awayTeamName || r.ateam === awayTeamName);
    const statHeaders = ["D", "G", "M", "T", "HO", "AF"];

    const mapPlayer = (r: any): BoxScoreRow =>
      toRow(r.player ?? r.name ?? "Unknown", {
        D: r.disposals ?? null,
        G: r.goals ?? null,
        M: r.marks ?? null,
        T: r.tackles ?? null,
        HO: r.hitouts ?? null,
        AF: r.af ?? r.fantasy ?? null,
      });

    return {
      teamStats: {},
      boxScore: {
        statHeaders,
        home: homeRows.map(mapPlayer),
        away: awayRows.map(mapPlayer),
      },
    };
  } catch {
    return { teamStats: {}, boxScore: null };
  }
}
