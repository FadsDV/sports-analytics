import { BetRisk } from "@/lib/types";

const RISK_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string; bar: string }
> = {
  Low:    { label: "Low Risk",    color: "text-green-400",  bg: "bg-green-900/20",  border: "border-green-800/60",  bar: "bg-green-500"  },
  Medium: { label: "Medium Risk", color: "text-yellow-400", bg: "bg-yellow-900/20", border: "border-yellow-800/60", bar: "bg-yellow-500" },
  High:   { label: "High Risk",   color: "text-red-400",    bg: "bg-red-900/20",    border: "border-red-800/60",    bar: "bg-red-500"    },
};

const IMPACT_COLOR = {
  positive: "text-green-400",
  negative: "text-red-400",
  neutral:  "text-gray-400",
};

const IMPACT_ICON = {
  positive: "▲",
  negative: "▼",
  neutral:  "●",
};

export default function BetRiskPanel({ betRisk }: { betRisk: BetRisk }) {
  const cfg = RISK_CONFIG[betRisk.level];

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
        Bet Risk Rating
      </h3>

      {/* Risk level header */}
      <div className={`flex items-center justify-between p-3 rounded-lg border mb-3 ${cfg.bg} ${cfg.border}`}>
        <div>
          <div className={`text-xl font-bold ${cfg.color}`}>{cfg.label}</div>
          <div className="text-xs text-gray-400 mt-0.5">Score: {betRisk.score} / 100</div>
        </div>
        <div className={`text-4xl font-black ${cfg.color} opacity-40`}>
          {betRisk.score}
        </div>
      </div>

      {/* Score bar: green → yellow → red gradient */}
      <div className="mb-4">
        <div className="h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cfg.bar}`}
            style={{ width: `${betRisk.score}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600 mt-1 px-0.5">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
      </div>

      {/* Factors */}
      <div className="space-y-2.5 mb-4">
        {betRisk.factors.map((f, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 text-[10px] font-bold shrink-0 ${IMPACT_COLOR[f.impact]}`}>
              {IMPACT_ICON[f.impact]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-400">{f.label}</div>
              <div className="text-xs text-gray-300 mt-0.5">{f.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="text-xs text-gray-400 bg-[#080e1c] rounded-lg p-3 leading-relaxed border border-[#1e293b]">
        <span className="text-gray-500 font-medium">Analysis: </span>
        {betRisk.summary}
      </div>
    </div>
  );
}
