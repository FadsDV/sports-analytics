import type { TeamForm } from "@/lib/esports/analytics/types";
import { FormPills } from "./FormPills";

export function TeamFormComparison({
  homeForm,
  awayForm,
  homeTeamName,
  awayTeamName,
}: {
  homeForm: TeamForm;
  awayForm: TeamForm;
  homeTeamName: string;
  awayTeamName: string;
}) {
  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#1e293b]">
        <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
          Form Comparison
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-[#1e293b]">
        <FormSide form={homeForm} teamName={homeTeamName} align="left" />
        <FormSide form={awayForm} teamName={awayTeamName} align="right" />
      </div>
    </div>
  );
}

function FormSide({
  form,
  teamName,
  align,
}: {
  form: TeamForm;
  teamName: string;
  align: "left" | "right";
}) {
  const isRight = align === "right";
  const winPct = Math.round(form.winRate * 100);
  const streak = form.streak.type ? `${form.streak.count}${form.streak.type}` : "—";
  const streakColor =
    form.streak.type === "W"
      ? "text-emerald-400"
      : form.streak.type === "L"
      ? "text-red-400"
      : "text-white";

  return (
    <div className={`p-4 space-y-4 ${isRight ? "text-right" : ""}`}>
      <div className="text-xs font-semibold text-white truncate">{teamName}</div>

      <div className={`flex gap-4 ${isRight ? "justify-end" : ""}`}>
        <StatChip label="Win%" value={`${winPct}%`} />
        <StatChip label="Streak" value={streak} valueClass={streakColor} />
        <StatChip label="Sample" value={`${form.sampleSize}g`} />
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] text-[#374151] uppercase tracking-wider">Last 5</div>
        <div className={`flex gap-1 ${isRight ? "justify-end" : ""}`}>
          <FormPills entries={form.entries} limit={5} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] text-[#374151] uppercase tracking-wider">Last 10</div>
        <div className={`flex gap-1 flex-wrap ${isRight ? "justify-end" : ""}`}>
          <FormPills entries={form.entries} limit={10} />
        </div>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className={`text-sm font-bold ${valueClass}`}>{value}</div>
      <div className="text-[9px] text-[#374151] uppercase tracking-wider">{label}</div>
    </div>
  );
}
