/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import type { SofascorePlayer, SofascorePlayerSeasonStats, SofascoreGameLog } from "@/lib/sports/sofascore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ratingColor(r: number) {
  if (r >= 8.0) return "bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/40";
  if (r >= 7.5) return "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30";
  if (r >= 6.5) return "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30";
  return "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30";
}

function posColor(pos: string) {
  const p = pos.toUpperCase()[0];
  if (p === "G") return "text-[#F59E0B] bg-[#F59E0B]/10";
  if (p === "D") return "text-[#60A5FA] bg-[#60A5FA]/10";
  if (p === "M") return "text-[#22C55E] bg-[#22C55E]/10";
  if (p === "F" || p === "A") return "text-[#EF4444] bg-[#EF4444]/10";
  return "text-text-2 bg-surface2";
}

function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null) return "—";
  return dec > 0 ? v.toFixed(dec) : String(Math.round(v));
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-text-2">{label}</span>
      <span className={`text-[11px] font-bold tabular-nums ${highlight ? "text-primary" : "text-text-1"}`}>{value}</span>
    </div>
  );
}

function SeasonStatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center ${highlight ? "bg-primary/10 border border-primary/20" : "bg-surface2"}`}>
      <div className={`text-sm font-black tabular-nums leading-none ${highlight ? "text-primary" : "text-text-1"}`}>{value}</div>
      <div className="text-[9px] text-text-2 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function PlayerPhoto({ id, name, size = 72 }: { id: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  if (failed) {
    return (
      <div
        className="rounded-full bg-surface2 border-2 border-border flex items-center justify-center text-text-1 font-black shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >{initials}</div>
    );
  }
  return (
    <img
      src={`https://img.sofascore.com/api/v1/player/${id}/image`}
      alt={name} width={size} height={size}
      onError={() => setFailed(true)}
      className="rounded-full object-cover bg-surface2 border-2 border-border/40 shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Recent game row ──────────────────────────────────────────────────────────

function GameLogRow({ game, playerId }: { game: SofascoreGameLog; playerId: number }) {
  const isHome = game.homeTeamId === playerId; // not quite right - should use player team
  const scored = (game.homeScore ?? 0) > (game.awayScore ?? 0)
    ? "home" : (game.awayScore ?? 0) > (game.homeScore ?? 0)
    ? "away" : "draw";
  // Determine opponent name
  const opponent = game.homeTeam.includes("Bayern") || game.homeTeam.includes("Arsenal") || game.homeTeam.length > 0
    ? "" : "";
  const dateStr = game.date.slice(5); // MM-DD

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/30 last:border-0 text-[11px]">
      <span className="text-text-2 w-10 shrink-0 tabular-nums">{dateStr}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-text-1">
          {game.homeTeam.split(" ").slice(-1)[0]} {game.homeScore}–{game.awayScore} {game.awayTeam.split(" ").slice(-1)[0]}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 tabular-nums">
        {game.goals != null && <span className={`text-[10px] ${(game.goals ?? 0) > 0 ? "text-primary font-bold" : "text-text-2"}`}>⚽{game.goals}</span>}
        {game.assists != null && <span className={`text-[10px] ${(game.assists ?? 0) > 0 ? "text-[#60A5FA] font-bold" : "text-text-2"}`}>🎯{game.assists}</span>}
        {game.rating != null && (
          <span className={`text-[10px] px-1 py-px rounded font-black border ${ratingColor(game.rating)}`}>
            {game.rating.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Props & main component ───────────────────────────────────────────────────

interface SoccerPlayerDrawerProps {
  player:          SofascorePlayer;
  teamName:        string;
  sport:           string;
  opponentTeamId?: number;
  onClose:         () => void;
}

interface PlayerData {
  seasonStats:  SofascorePlayerSeasonStats | null;
  recentGames:  SofascoreGameLog[];
  vsOpponent:   SofascoreGameLog | null;
}

export default function SoccerPlayerDrawer({ player, teamName, sport, opponentTeamId, onClose }: SoccerPlayerDrawerProps) {
  const [visible, setVisible]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState<PlayerData | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!player.id) { setLoading(false); return; }
    const params = new URLSearchParams({ sport });
    if (opponentTeamId) params.set("opponentTeamId", String(opponentTeamId));
    fetch(`/api/soccer/player/${player.id}?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [player.id, sport, opponentTeamId]);

  // Current match stats (if available from lineup data)
  const ms = player.stats;
  const hasMatchStats = Object.values(ms).some(v => v != null && v !== 0);
  const matchMins = player.stats.minutesPlayed ?? (player.stats.secondsPlayed != null ? Math.round((player.stats.secondsPlayed as number) / 60) : null);

  // Season stats from API
  const ss = data?.seasonStats;
  const apps = ss?.appearances ?? 1;

  const posGroup = player.position.toUpperCase()[0];

  // Season hero stats by position
  const seasonHero: { label: string; value: string; highlight?: boolean }[] =
    !ss ? [] :
    posGroup === "G" ? [
      { label: "Apps",  value: fmt(ss.appearances) },
      { label: "Rating", value: fmt(ss.rating, 2) },
    ] : posGroup === "D" ? [
      { label: "Apps",    value: fmt(ss.appearances) },
      { label: "G+A",     value: `${fmt(ss.goals)}+${fmt(ss.assists)}` },
      { label: "Rating",  value: fmt(ss.rating, 2) },
    ] : posGroup === "M" ? [
      { label: "Apps",    value: fmt(ss.appearances) },
      { label: "G+A",     value: `${fmt(ss.goals)}+${fmt(ss.assists)}` },
      { label: "Rating",  value: fmt(ss.rating, 2) },
    ] : [
      { label: "Apps",    value: fmt(ss.appearances) },
      { label: "Goals",   value: fmt(ss.goals), highlight: (ss.goals ?? 0) >= 5 },
      { label: "Rating",  value: fmt(ss.rating, 2) },
    ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-[340px] max-w-[92vw] bg-bg border-l border-border z-50 overflow-y-auto transition-transform duration-300 flex flex-col"
        style={{ transform: visible ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg border-b border-border px-4 py-3 flex items-center justify-between z-10 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-2">{teamName}</span>
          <button onClick={onClose} className="text-text-2 hover:text-text-1 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Player identity */}
          <div className="flex items-center gap-3">
            <PlayerPhoto id={player.id} name={player.name} size={64} />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-black text-text-1 leading-tight">{player.name}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${posColor(player.position)}`}>{player.position}</span>
                <span className="text-[10px] text-text-2 font-mono">#{player.jerseyNumber}</span>
                {!player.starter && <span className="text-[9px] text-text-2 bg-surface2 border border-border px-1 py-px rounded">SUB</span>}
              </div>
            </div>
            {player.rating != null && (
              <div className={`flex-shrink-0 text-lg font-black px-2.5 py-1.5 rounded-xl border-2 tabular-nums ${ratingColor(player.rating)}`}>
                {player.rating.toFixed(1)}
              </div>
            )}
          </div>

          {/* Season averages */}
          {loading && (
            <div className="bg-surface border border-border rounded-xl p-4 text-center">
              <div className="text-[11px] text-text-2">Loading season stats...</div>
            </div>
          )}

          {ss && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2.5">Season {ss.appearances ? `(${ss.appearances} apps)` : ""}</div>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {seasonHero.map(h => (
                  <SeasonStatBox key={h.label} label={h.label} value={h.value} highlight={h.highlight} />
                ))}
              </div>
              <div className="space-y-0">
                {ss.goals != null        && <StatRow label="Goals"          value={fmt(ss.goals)}                highlight={(ss.goals ?? 0) >= 1} />}
                {ss.assists != null      && <StatRow label="Assists"         value={fmt(ss.assists)}              highlight={(ss.assists ?? 0) >= 1} />}
                {ss.expectedGoals != null && <StatRow label="xG"             value={fmt(ss.expectedGoals, 2)}    highlight={(ss.expectedGoals ?? 0) >= 3} />}
                {ss.expectedAssists != null && <StatRow label="xA"           value={fmt(ss.expectedAssists, 2)} />}
                {ss.totalShots != null   && <StatRow label="Shots"           value={fmt(ss.totalShots)} />}
                {ss.shotsOnTarget != null && <StatRow label="On Target"      value={fmt(ss.shotsOnTarget)} />}
                {ss.keyPasses != null    && <StatRow label="Key Passes"      value={fmt(ss.keyPasses)}           highlight={(ss.keyPasses ?? 0) >= 20} />}
                {ss.tackles != null      && <StatRow label="Tackles"         value={fmt(ss.tackles)} />}
                {ss.interceptions != null && <StatRow label="Interceptions"  value={fmt(ss.interceptions)} />}
                {ss.accuratePassesPercentage != null && <StatRow label="Pass Acc." value={`${fmt(ss.accuratePassesPercentage, 1)}%`} highlight={(ss.accuratePassesPercentage ?? 0) >= 85} />}
                {ss.yellowCards != null  && <StatRow label="Yellow Cards"    value={fmt(ss.yellowCards)} />}
                {ss.minutesPlayed != null && <StatRow label="Minutes"        value={fmt(ss.minutesPlayed)} />}
              </div>
            </div>
          )}

          {/* Current match stats (if played) */}
          {hasMatchStats && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">This Match{matchMins != null ? ` · ${matchMins}'` : ""}</div>
              {ms.goals != null          && <StatRow label="Goals"       value={fmt(ms.goals as number)}                         highlight={(ms.goals as number ?? 0) >= 1} />}
              {ms.goalAssist != null     && <StatRow label="Assists"     value={fmt(ms.goalAssist as number)}                    highlight={(ms.goalAssist as number ?? 0) >= 1} />}
              {ms.expectedGoals != null  && <StatRow label="xG"          value={fmt(ms.expectedGoals as number, 2)}              highlight={(ms.expectedGoals as number ?? 0) >= 0.4} />}
              {ms.totalShots != null     && <StatRow label="Shots"       value={fmt(ms.totalShots as number)} />}
              {ms.onTargetScoringAttempt != null && <StatRow label="On Target" value={fmt(ms.onTargetScoringAttempt as number)} />}
              {ms.keyPass != null        && <StatRow label="Key Passes"  value={fmt(ms.keyPass as number)}                       highlight={(ms.keyPass as number ?? 0) >= 2} />}
              {ms.totalTackle != null    && <StatRow label="Tackles"     value={fmt(ms.totalTackle as number)} />}
              {ms.interceptionWon != null && <StatRow label="INT"        value={fmt(ms.interceptionWon as number)} />}
              {ms.accuratePass != null   && <StatRow label="Passes"      value={fmt(ms.accuratePass as number)} />}
              {ms.touches != null        && <StatRow label="Touches"     value={fmt(ms.touches as number)} />}
            </div>
          )}

          {/* Last 5 games */}
          {!loading && (data?.recentGames?.length ?? 0) > 0 && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">Last 5 Games</div>
              {data!.recentGames.map(g => (
                <GameLogRow key={g.eventId} game={g} playerId={player.id} />
              ))}
            </div>
          )}

          {/* vs Opponent */}
          {!loading && data?.vsOpponent && (
            <div className="bg-surface border border-border rounded-xl p-3">
              <div className="text-[9px] font-black uppercase tracking-widest text-text-2 mb-2">vs This Opponent</div>
              <GameLogRow game={data.vsOpponent} playerId={player.id} />
            </div>
          )}

          {/* Sofascore link */}
          <a
            href={`https://www.sofascore.com/player/${player.name.toLowerCase().replace(/\s+/g, "-")}/${player.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[10px] text-text-2 hover:text-text-1 py-2 transition-colors"
          >
            View on Sofascore →
          </a>
        </div>
      </div>
    </>
  );
}
