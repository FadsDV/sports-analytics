"use client";

import { useState } from "react";

type DebugResponse = {
  action?: string;
  endpoint?: string;
  status?: number;
  ok?: boolean;
  data?: unknown;
  error?: string;
};

export default function DebugPage() {
  const [eventId, setEventId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [response, setResponse] = useState<DebugResponse | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function run(action: string) {
    setLoadingAction(action);
    setResponse(null);

    const params = new URLSearchParams({ action });
    if ((action === "nba" || action === "soccer") && eventId) {
      params.set("eventId", eventId);
    }
    if (action === "roster" && teamId) {
      params.set("teamId", teamId);
    }
    if (action === "player" && playerId) {
      params.set("playerId", playerId);
    }

    try {
      const res = await fetch(`/api/debug?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DebugResponse;
      setResponse(json);
    } catch (error) {
      setResponse({
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Debug API Responses</h1>
        <p className="text-sm text-gray-500 mt-1">
          Raw ESPN responses only. No transforms, no field mapping.
        </p>
      </div>

      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Event ID
            </div>
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#080e1c] px-3 py-2 text-sm text-white outline-none"
              placeholder="401585123"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Team ID
            </div>
            <input
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#080e1c] px-3 py-2 text-sm text-white outline-none"
              placeholder="2"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Player ID
            </div>
            <input
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="w-full rounded-lg border border-[#1e293b] bg-[#080e1c] px-3 py-2 text-sm text-white outline-none"
              placeholder="4432816"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run("nba")}
            className="rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-2 text-sm text-white"
            disabled={loadingAction !== null}
          >
            {loadingAction === "nba" ? "Loading..." : "Fetch NBA Game"}
          </button>

          <button
            type="button"
            onClick={() => run("soccer")}
            className="rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-2 text-sm text-white"
            disabled={loadingAction !== null}
          >
            {loadingAction === "soccer" ? "Loading..." : "Fetch Soccer Game"}
          </button>

          <button
            type="button"
            onClick={() => run("roster")}
            className="rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-2 text-sm text-white"
            disabled={loadingAction !== null}
          >
            {loadingAction === "roster" ? "Loading..." : "Fetch Team Roster"}
          </button>

          <button
            type="button"
            onClick={() => run("player")}
            className="rounded-lg border border-[#1e293b] bg-[#111827] px-3 py-2 text-sm text-white"
            disabled={loadingAction !== null}
          >
            {loadingAction === "player" ? "Loading..." : "Fetch Player"}
          </button>
        </div>
      </div>

      <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Raw Response
        </div>
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-[#1e293b] bg-[#080e1c] p-4">
          <pre className="text-xs text-gray-200 whitespace-pre-wrap break-words">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
