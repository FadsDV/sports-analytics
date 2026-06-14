import type { TeamForm } from "@/lib/esports/analytics/types";
import { SectionCard } from "./SectionCard";
import { FormPills } from "./FormPills";

export function TeamFormSection({ form }: { form: TeamForm }) {
  const winPct = Math.round(form.winRate * 100);
  const mapWinPct = Math.round(form.mapWinRate * 100);
  const streak =
    form.streak.type ? `${form.streak.count}${form.streak.type}` : "—";

  if (form.sampleSize === 0) {
    return (
      <SectionCard label="Team Form">
        <p className="text-xs text-[#374151]">No completed matches in sample.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard label="Team Form">
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3 pb-3 border-b border-[#1e293b]">
          <StatBox label="Win Rate" value={`${winPct}%`} />
          <StatBox label="Map W%" value={`${mapWinPct}%`} />
          <StatBox
            label="Streak"
            value={streak}
            valueClass={
              form.streak.type === "W" ? "text-emerald-400" : form.streak.type === "L" ? "text-red-400" : "text-white"
            }
          />
          <StatBox label="Sample" value={`${form.sampleSize}g`} />
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] text-[#374151] uppercase tracking-wider">Last 5</div>
          <FormPills entries={form.entries} limit={5} />
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] text-[#374151] uppercase tracking-wider">Last 10</div>
          <FormPills entries={form.entries} limit={10} />
        </div>
      </div>
    </SectionCard>
  );
}

function StatBox({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="text-center">
      <div className={`text-base font-bold ${valueClass}`}>{value}</div>
      <div className="text-[9px] text-[#374151] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}
