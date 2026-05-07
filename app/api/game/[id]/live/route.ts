import { NextRequest, NextResponse } from "next/server";
import { ESPN_PATHS } from "@/lib/sports/espn";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

export interface LiveGameState {
  homeScore: number | null;
  awayScore: number | null;
  status: "live" | "upcoming" | "finished";
  period: number | null;
  displayClock: string | null;
  shortDetail: string | null;
  lineScores: { home: number[]; away: number[] } | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const dash = id.indexOf("-");
  if (dash < 0) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const sport  = id.slice(0, dash) as keyof typeof ESPN_PATHS;
  const eventId = id.slice(dash + 1);
  const sportPath = ESPN_PATHS[sport];
  if (!sportPath) return NextResponse.json({ error: "unknown sport" }, { status: 400 });

  try {
    const url = `${ESPN_BASE}/${sportPath}/summary?event=${eventId}`;
    const res = await fetch(url, {
      // No cache for live polling — always fresh
      cache: "no-store",
      headers: { "User-Agent": "SportsPulse/1.0 personal" },
    });
    if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data = await res.json();
    const comp = data.header?.competitions?.[0];
    if (!comp) return NextResponse.json({ error: "no competition" }, { status: 404 });

    const state = comp.status?.type?.state ?? "pre";
    const status: LiveGameState["status"] =
      state === "in" ? "live" : state === "post" ? "finished" : "upcoming";

    const competitors: any[] = comp.competitors ?? [];
    const home = competitors.find((c: any) => c.homeAway === "home");
    const away = competitors.find((c: any) => c.homeAway === "away");

    const toScore = (c: any) => {
      const n = Number(c?.score);
      return isNaN(n) ? null : n;
    };

    // Quarter/period line scores (linescores array on each competitor)
    let lineScores: LiveGameState["lineScores"] = null;
    const hl: any[] = home?.linescores ?? [];
    const al: any[] = away?.linescores ?? [];
    if (hl.length > 0) {
      lineScores = {
        home: hl.map((l: any) => Number(l.value ?? l.displayValue ?? 0)),
        away: al.map((l: any) => Number(l.value ?? l.displayValue ?? 0)),
      };
    }

    const result: LiveGameState = {
      homeScore:    toScore(home),
      awayScore:    toScore(away),
      status,
      period:       comp.status?.period ?? null,
      displayClock: comp.status?.displayClock ?? null,
      shortDetail:  comp.status?.type?.shortDetail ?? comp.status?.type?.description ?? null,
      lineScores,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }
}
