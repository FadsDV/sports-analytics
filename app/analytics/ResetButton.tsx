"use client";

import { useState } from "react";

export default function ResetButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleReset() {
    if (!confirm("Reset ALL outcome data? This clears hit/miss for every logged game and allows them to re-resolve next time you open a finished game.")) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/slips/outcome?gameId=ALL", { method: "DELETE" });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={status === "loading"}
      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
        status === "done"    ? "border-green-500/40 text-green-400 bg-green-500/5" :
        status === "error"   ? "border-red-500/40 text-red-400 bg-red-500/5" :
        status === "loading" ? "border-border text-text-2 opacity-50 cursor-not-allowed" :
        "border-border text-text-2 hover:text-text-1 hover:border-text-2"
      }`}
    >
      {status === "loading" ? "Resetting…" :
       status === "done"    ? "✓ Reset complete" :
       status === "error"   ? "✗ Failed" :
       "Reset all outcome data"}
    </button>
  );
}
