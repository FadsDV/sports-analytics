/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react"; // used in PlayerPhoto
import type { SofascorePlayer } from "@/lib/sports/sofascore";
import type { ESPNPlayer } from "@/lib/sports/espnPlayers";

// ─── Stat config ─────────────────────────────────────────────────────────────

interface StatCol {
  key:      string;
  label:    string;
  hi?:      (v: number) => boolean; // highlight condition
  fmt?:     (v: number) => string;
  pct?:     boolean;
}

const STAT_COLS: StatCol[] = [
  { key: "minutesPlayed",              label: "MIN" },
  { key: "goals",                      label: "G",   hi: v => v >= 1 },
  { key: "goalAssist",                 label: "A",   hi: v => v >= 1 },
  { key: "expectedGoals",              label: "xG",  fmt: v => v.toFixed(2), hi: v => v >= 0.5 },
  { key: "expectedAssists",            label: "xA",  fmt: v => v.toFixed(2), hi: v => v >= 0.3 },
  { key: "totalShots",                 label: "SH" },
  { key: "totalShot",                  label: "SH" },  // fallback key variant
  { key: "onTargetScoringAttempt",     label: "ST",  hi: v => v >= 2 },
  { key: "keyPass",                    label: "KP",  hi: v => v >= 2 },
  { key: "progressiveBallCarriesCount",label: "PRC", hi: v => v >= 3 },
  { key: "totalTackle",                label: "TKL" },
  { key: "interceptionWon",            label: "INT", hi: v => v >= 2 },
  { key: "passAccuracy",               label: "PS%", fmt: v => `${Math.round(v)}%`, hi: v => v >= 90 },
  { key: "accuratePassesPercentage",   label: "PS%", fmt: v => `${Math.round(v)}%`, hi: v => v >= 90 },
  { key: "accuratePass",               label: "PSS" },
  { key: "duelWon",                    label: "DW",  hi: v => v >= 5 },
  { key: "rating",                     label: "RTG", fmt: v => v.toFixed(1), hi: v => v >= 7.5 },
];

// Default visible columns — includes xG, xA, progressive carries
const DEFAULT_COLS = ["minutesPlayed", "goals", "goalAssist", "expectedGoals", "expectedAssists", "totalShots", "totalShot", "onTargetScoringAttempt", "keyPass", "progressiveBallCarriesCount", "totalTackle", "interceptionWon", "rating"];

// ─── Name matching ────────────────────────────────────────────────────────────

function normName(s: string) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

function matchPlayerToESPN(sofa: SofascorePlayer, espnSquad: ESPNPlayer[]): ESPNPlayer | undefined {
  const sofaN = normName(sofa.name);
  const sofaS = normName(sofa.shortName);
  return espnSquad.find(p => {
    const pn = normName(p.displayName ?? "");
    if (!pn) return false;
    if (pn === sofaN || pn === sofaS) return true;
    if (sofaN.length >= 6 && pn.includes(sofaN)) return true;
    if (pn.length >= 6 && sofaN.includes(pn)) return true;
    // Last-name match (both ≥ 5 chars)
    const lastName = sofaN.slice(-6);
    if (lastName.length >= 5 && pn.endsWith(lastName)) return true;
    return false;
  });
}

// ─── Position colour ─────────────────────────────────────────────────────────

function posColor(pos: string): string {
  const p = pos.toUpperCase();
  if (p === "G" || p === "GK" || p === "GL") return "text-[#F59E0B]";
  if (p === "D" || p.startsWith("D")) return "text-[#60A5FA]";
  if (p === "M" || p.startsWith("M")) return "text-[#22C55E]";
  if (p === "F" || p.startsWith("F") || p === "A") return "text-[#EF4444]";
  return "text-text-2";
}

// ─── Rating badge ─────────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: number }) {
  const color = rating >= 8.0
    ? "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30"
    : rating >= 7.5
    ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20"
    : rating >= 6.5
    ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20"
    : "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20";
  return (
    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border tabular-nums ${color}`}>
      {rating.toFixed(1)}
    </span>
  );
}

// ─── Player photo ─────────────────────────────────────────────────────────────

function PlayerPhoto({ sofaId, espnSrc, name, size = 28 }: { sofaId?: number; espnSrc?: string; name: string; size?: number }) {
  // Try Sofascore CDN first, fall back to ESPN, then initials
  const sofaUrl = sofaId ? `https://img.sofascore.com/api/v1/player/${sofaId}/image` : null;
  const [src, setSrc]   = useState<string | null>(sofaUrl ?? espnSrc ?? null);
  const [tried, setTried] = useState<"sofa" | "espn" | "none">(sofaUrl ? "sofa" : espnSrc ? "espn" : "none");

  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const handleError = () => {
    if (tried === "sofa" && espnSrc) {
      setSrc(espnSrc);
      setTried("espn");
    } else {
      setSrc(null);
      setTried("none");
    }
  };

  if (!src) {
    return (
      <div
        className="rounded-full bg-surface2 border border-border flex items-center justify-center shrink-0 text-text-2 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={handleError}
      className="rounded-full object-cover shrink-0 bg-surface2"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  espnPlayer,
  activeCols,
  isSubstitute,
}: {
  player:      SofascorePlayer;
  espnPlayer?: ESPNPlayer;
  activeCols:  string[];
  isSubstitute: boolean;
}) {
  const headshot = espnPlayer?.headshot;
  const sofaId   = player.id || undefined;
  const mins = player.stats.minutesPlayed ?? (
    player.stats.secondsPlayed != null ? Math.round(player.stats.secondsPlayed as number / 60) : null
  );

  return (
    <tr className={`border-b border-border last:border-0 hover:bg-surface2 transition-colors ${isSubstitute ? "opacity-70" : ""}`}>
      {/* Player cell */}
      <td className="py-2 pr-2 sticky left-0 bg-surface">
        <div className="flex items-center gap-2 min-w-0">
          <PlayerPhoto sofaId={sofaId} espnSrc={headshot} name={player.name} size={26} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-text-1 truncate leading-tight">
                {player.shortName}
              </span>
              {player.rating != null && <RatingBadge rating={player.rating} />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono text-text-2 w-4 shrink-0">{player.jerseyNumber}</span>
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${posColor(player.position)}`}>
                {player.position}
              </span>
              {isSubstitute && <span className="text-[8px] text-text-2">SUB</span>}
            </div>
          </div>
        </div>
      </td>

      {/* Stat cells */}
      {activeCols.map(key => {
        const col = STAT_COLS.find(c => c.key === key)!;
        let raw: number | null | undefined;
        if (key === "minutesPlayed") {
          raw = mins;
        } else {
          raw = player.stats[key] as number | null | undefined;
        }
        const val = raw != null ? raw : null;
        const formatted = val != null ? (col.fmt ? col.fmt(val) : String(val)) : "—";
        const isHigh = val != null && col.hi ? col.hi(val) : false;
        const isRating = key === "rating";

        return (
          <td key={key} className={`py-2 px-1 text-right tabular-nums text-[11px] ${
            isRating ? "" :
            isHigh ? "text-text-1 font-semibold" : "text-text-2"
          }`}>
            {val === null ? <span className="text-text-2/30">—</span> : formatted}
          </td>
        );
      })}
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SoccerPlayerListProps {
  players:    SofascorePlayer[];
  espnSquad:  ESPNPlayer[];
  formation?: string;
}

export default function SoccerPlayerList({ players, espnSquad, formation }: SoccerPlayerListProps) {
  const activeCols = DEFAULT_COLS;

  const starters = players.filter(p => p.starter);
  const subs     = players.filter(p => !p.starter);

  if (starters.length === 0 && subs.length === 0) {
    return <p className="text-xs text-text-2">No lineup data available.</p>;
  }

  // Pre-match players sorted — starters by position order (GK, DEF, MID, FWD)
  const posOrder: Record<string, number> = { G: 0, GK: 0, GL: 0, D: 1, M: 2, F: 3, A: 3 };
  const sortedStarters = [...starters].sort((a, b) => {
    const pa = posOrder[a.position.toUpperCase()[0] ?? ""] ?? 9;
    const pb = posOrder[b.position.toUpperCase()[0] ?? ""] ?? 9;
    return pa - pb;
  });

  // Build stat header labels
  const cols = STAT_COLS.filter(c => activeCols.includes(c.key));

  // Check which cols actually have data, deduplicate by label (keep first with data)
  const seenLabels = new Set<string>();
  const colsWithData = cols.filter(col => {
    const hasData = [...starters, ...subs].some(p => p.stats[col.key] != null);
    if (!hasData) return false;
    if (seenLabels.has(col.label)) return false;
    seenLabels.add(col.label);
    return true;
  });

  const displayCols = colsWithData.length > 0 ? colsWithData.map(c => c.key) : DEFAULT_COLS.slice(0, 5);

  return (
    <div>
      {/* Formation badge */}
      {formation && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[9px] uppercase tracking-widest text-text-2">Formation</span>
          <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded">{formation}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[400px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left py-1.5 pr-2 text-text-2 sticky left-0 bg-surface">Player</th>
              {displayCols.map(key => {
                const col = STAT_COLS.find(c => c.key === key)!;
                return (
                  <th key={key} className="text-right py-1.5 px-1 text-text-2 text-[10px] font-semibold whitespace-nowrap">
                    {col?.label ?? key}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedStarters.map(p => {
              const esp = matchPlayerToESPN(p, espnSquad);
              return (
                <PlayerRow
                  key={p.id}
                  player={p}
                  espnPlayer={esp}
                  activeCols={displayCols}
                  isSubstitute={false}
                />
              );
            })}

            {subs.length > 0 && (
              <>
                <tr>
                  <td colSpan={displayCols.length + 1} className="pt-3 pb-1 px-0">
                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-text-2">Substitutes</span>
                  </td>
                </tr>
                {subs.map(p => {
                  const esp = matchPlayerToESPN(p, espnSquad);
                  return (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      espnPlayer={esp}
                      activeCols={displayCols}
                      isSubstitute={true}
                    />
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
