import { computeSoccerKitchen, type SoccerKitchenInput } from "@/lib/sports/soccer/kitchen";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json() as Omit<SoccerKitchenInput, "propOdds">;
    const slips = computeSoccerKitchen(body);
    return NextResponse.json(slips);
  } catch (err) {
    console.error("[api/soccer/kitchen] error", err);
    return NextResponse.json([], { status: 500 });
  }
}
