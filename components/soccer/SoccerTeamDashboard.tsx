/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { TeamHistoryGame } from "@/lib/sports/espn";
import FormPills from "@/components/FormPills";

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({
  title, children, className = "", accent = false,
}: {
  title?: string; children: React.ReactNode; className?: string; accent?: boolean;
}) {
  return (
    <div className={`bg-[#111827] rounded-xl border border-white/[0.05] overflow-hidden ${accent ? "border-l-2 border-l-[#3B82F6]" : ""} ${className}`}>
      {title && (
        <div className="px-3 py-2 border-b border-white/[0.05] bg-white/[0.01]">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280]">{title}</span>
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatRow({
  label, value, sub, accent = false,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
      <span className="text-xs text-[#6B7280]">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${accent ? "text-[#3B82F6]" : "text-[#D1D5DB]"}`}>
        {value}{sub && <span className="text-[#4B5563] ml-1 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

function ResultPill({ result }: { result: "W" | "L" | "D" | null }) {
  if (!result) return null;
  const cls = result === "W"
    ? "bg-[#22C55E]/20 text-[#22C55E]"
    : result === "L"
    ? "bg-[#EF4444]/20 text-[#EF4444]"
    : "bg-[#F59E0B]/20 text-[#F59E0B]";
  return (
    <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${cls}`}>{result}</span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SoccerTeamDashboard({
  teamId,
  history,
  homeHistory,
  awayHistory,
}: {
  teamId: string;
  history: TeamHistoryGame[];
  homeHistory: TeamHistoryGame[];
  awayHistory: TeamHistoryGame[];
}) {
  const last5 = history.slice(0, 5);
  const form = last5.map(g => g.result);

  const stats = useMemo(() => {
    const parse = (s: string | null) => s?.split("-").map(Number) ?? [0, 0];
    const scored = history.map(g => parse(g.score)[0]);
    const conceded = history.map(g => parse(g.score)[1]);
    const cleanSheets = history.filter(g => parse(g.score)[1] === 0).length;
    
    const avg = (arr: number[]) => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : "0.00";
    
    return {
      avgScored: avg(scored),
      avgConceded: avg(conceded),
      cleanSheetPct: history.length > 0 ? Math.round((cleanSheets / history.length) * 100) : 0,
      totalGames: history.length,
    };
  }, [history]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 bg-[#111827] p-5 rounded-2xl border border-white/5">
        <div className="w-16 h-16 bg-white/5 rounded-xl flex items-center justify-center">
          <span className="text-2xl">⚽</span>
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Team Analytics</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-[#6B7280]">ID: {teamId}</span>
            <span className="w-1 h-1 rounded-full bg-[#374151]" />
            <span className="text-xs text-[#3B82F6] font-semibold uppercase tracking-widest">Soccer</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Team Form */}
        <Card title="Team Form" accent>
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-2">Last 5 Matches</div>
              <FormPills form={form as any} />
            </div>
            <div className="space-y-1">
              <StatRow label="Wins" value={history.filter(g => g.result === "W").length} />
              <StatRow label="Draws" value={history.filter(g => g.result === "D").length} />
              <StatRow label="Losses" value={history.filter(g => g.result === "L").length} />
            </div>
          </div>
        </Card>

        {/* 2. Attack / Defense Profile */}
        <Card title="Attack / Defense Profile">
          <div className="space-y-1">
            <StatRow label="Goals Scored (Avg)" value={stats.avgScored} accent />
            <StatRow label="Goals Conceded (Avg)" value={stats.avgConceded} />
            <StatRow label="Goal Differential" value={(parseFloat(stats.avgScored) - parseFloat(stats.avgConceded)).toFixed(2)} />
            <StatRow label="Clean Sheet %" value={`${stats.cleanSheetPct}%`} />
          </div>
        </Card>

        {/* 3. Possession / Chance Creation */}
        <Card title="Possession / Chance Creation">
          <div className="space-y-1">
            <StatRow label="Avg Possession" value="—" sub="Connect Sofascore" />
            <StatRow label="Shots per Game" value="—" />
            <StatRow label="Shots on Target" value="—" />
            <StatRow label="Big Chances" value="—" />
          </div>
        </Card>

        {/* 4. Defensive Trends */}
        <Card title="Defensive Trends">
          <div className="space-y-1">
            <StatRow label="Tackles per Game" value="—" />
            <StatRow label="Interceptions" value="—" />
            <StatRow label="Clearances" value="—" />
            <StatRow label="Saves per Game" value="—" />
          </div>
        </Card>

        {/* 5. Home / Away Splits */}
        <Card title="Home / Away Splits">
          <div className="space-y-4">
            <div>
              <div className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-1">Home Record</div>
              <div className="text-sm font-bold text-white">
                {homeHistory.filter(g => g.result === "W").length}W {homeHistory.filter(g => g.result === "D").length}D {homeHistory.filter(g => g.result === "L").length}L
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[#4B5563] uppercase tracking-widest mb-1">Away Record</div>
              <div className="text-sm font-bold text-[#9CA3AF]">
                {awayHistory.filter(g => g.result === "W").length}W {awayHistory.filter(g => g.result === "D").length}D {awayHistory.filter(g => g.result === "L").length}L
              </div>
            </div>
          </div>
        </Card>

        {/* 6. Match Tempo / Discipline */}
        <Card title="Match Tempo / Discipline">
          <div className="space-y-1">
            <StatRow label="Avg Fouls" value="—" />
            <StatRow label="Yellow Cards" value="—" />
            <StatRow label="Red Cards" value="—" />
            <StatRow label="Corners" value="—" />
          </div>
        </Card>
      </div>

      {/* Recent Matches Table */}
      <Card title="Recent Match History">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.05]">
                <th className="text-left py-2 text-[#4B5563]">Date</th>
                <th className="text-left py-2 text-[#4B5563]">Opponent</th>
                <th className="text-center py-2 text-[#4B5563]">Venue</th>
                <th className="text-right py-2 text-[#4B5563]">Score</th>
                <th className="text-right py-2 text-[#4B5563]">Result</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 10).map((g, i) => (
                <tr key={i} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02]">
                  <td className="py-2 text-[#6B7280] tabular-nums">{g.date}</td>
                  <td className="py-2 text-white font-medium">{g.opponent}</td>
                  <td className="py-2 text-center text-[#4B5563] uppercase text-[10px]">{g.homeAway === "home" ? "Home" : "Away"}</td>
                  <td className="py-2 text-right text-white font-mono">{g.score || "—"}</td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end">
                      <ResultPill result={g.result} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
