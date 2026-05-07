import { NextRequest, NextResponse } from "next/server";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const SOCCER_LEAGUE = "eng.1";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") ?? "";
  const eventId = searchParams.get("eventId") ?? "";
  const teamId = searchParams.get("teamId") ?? "";
  const playerId = searchParams.get("playerId") ?? "";
  let endpoint: string | null = null;

  if (action === "nba") {
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    endpoint = `${ESPN_BASE}/basketball/nba/summary?event=${encodeURIComponent(eventId)}`;
  } else if (action === "soccer") {
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    endpoint = `${ESPN_BASE}/soccer/${SOCCER_LEAGUE}/summary?event=${encodeURIComponent(eventId)}`;
  } else if (action === "roster") {
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    endpoint = `${ESPN_BASE}/basketball/nba/teams/${encodeURIComponent(teamId)}/roster`;
  } else if (action === "player") {
    if (!playerId) {
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    endpoint = `${ESPN_BASE}/basketball/nba/athletes/${encodeURIComponent(playerId)}`;
  } else {
    return NextResponse.json(
      { ok: false, error: "Missing required parameters" },
      { status: 400 }
    );
  }

  console.info("[SportsPulse] debug fetch", {
    action,
    eventId: eventId || null,
    teamId: teamId || null,
    playerId: playerId || null,
    endpoint,
  });

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { "User-Agent": "SportsPulse/1.0 debug" },
    });

    console.info("[SportsPulse] debug fetch status", {
      action,
      status: response.status,
      endpoint,
    });

    const text = await response.text();
    let payload: unknown = text;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return NextResponse.json(
      {
        endpoint,
        data: payload,
        ok: true,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
