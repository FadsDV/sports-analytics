import { Team, Weather } from "@/lib/types";
import FormPills from "./FormPills";

interface QuickInsightsProps {
  homeTeam:         Team;
  awayTeam:         Team;
  weather:          Weather;
  homeInjuredCount: number;
  awayInjuredCount: number;
}

const CARD = "bg-[#0f172a] border border-[#1e293b] rounded-xl p-3 flex flex-col gap-1.5";
const TITLE = "text-[10px] font-semibold uppercase tracking-widest text-gray-600";

// Weather condition → emoji
function weatherIcon(condition: string): string {
  const c = condition.toLowerCase();
  if (c === "indoor")            return "🏟";
  if (c.includes("storm"))       return "⛈";
  if (c.includes("snow"))        return "❄️";
  if (c.includes("rain"))        return "🌧";
  if (c.includes("partly"))      return "⛅";
  if (c.includes("cloud") || c.includes("overcast")) return "☁️";
  if (c.includes("fog"))         return "🌫";
  if (c.includes("wind"))        return "💨";
  return "☀️";
}

function splitPct(wins: number, losses: number, draws?: number): number {
  const total = wins + losses + (draws ?? 0);
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

export default function QuickInsights({
  homeTeam,
  awayTeam,
  weather,
  homeInjuredCount,
  awayInjuredCount,
}: QuickInsightsProps) {
  const homePct = splitPct(homeTeam.splits.home.wins, homeTeam.splits.home.losses, homeTeam.splits.home.draws);
  const awayPct = splitPct(awayTeam.splits.away.wins, awayTeam.splits.away.losses, awayTeam.splits.away.draws);

  const totalInjured = homeInjuredCount + awayInjuredCount;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">

      {/* Form */}
      <div className={CARD}>
        <div className={TITLE}>Form</div>
        <div className="space-y-1.5">
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">{homeTeam.shortName}</div>
            <FormPills form={homeTeam.form} />
          </div>
          <div>
            <div className="text-[11px] text-gray-500 mb-0.5">{awayTeam.shortName}</div>
            <FormPills form={awayTeam.form} />
          </div>
        </div>
      </div>

      {/* Weather */}
      <div className={CARD}>
        <div className={TITLE}>Weather</div>
        {weather.condition === "Indoor" ? (
          <div className="text-sm text-gray-300">🏟 Indoor Arena</div>
        ) : (
          <div className="space-y-0.5">
            <div className="text-sm text-gray-200 font-medium">
              {weatherIcon(weather.condition)} {weather.condition}
            </div>
            <div className="text-xs text-gray-500">{weather.tempC}°C</div>
            {weather.windKph > 0 && (
              <div className="text-xs text-gray-500">🌬 {weather.windKph} km/h</div>
            )}
            {weather.humidity > 0 && (
              <div className="text-xs text-gray-500">💧 {weather.humidity}%</div>
            )}
          </div>
        )}
      </div>

      {/* Home / Away Splits */}
      <div className={CARD}>
        <div className={TITLE}>Splits</div>
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[11px] text-gray-500">{homeTeam.shortName} home</span>
              <span className={`text-xs font-bold ${homePct >= 60 ? "text-green-400" : homePct >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                {homePct}%
              </span>
            </div>
            <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden">
              <div className="h-full bg-[#4361ee] rounded-full" style={{ width: `${homePct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[11px] text-gray-500">{awayTeam.shortName} away</span>
              <span className={`text-xs font-bold ${awayPct >= 60 ? "text-green-400" : awayPct >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                {awayPct}%
              </span>
            </div>
            <div className="h-1 bg-[#1e293b] rounded-full overflow-hidden">
              <div className="h-full bg-[#4361ee] rounded-full" style={{ width: `${awayPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Injuries */}
      <div className={CARD}>
        <div className={TITLE}>Injuries</div>
        {totalInjured === 0 ? (
          <div className="text-xs text-green-400">✅ None reported</div>
        ) : (
          <div className="space-y-1">
            {homeInjuredCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs text-gray-300">
                  {homeTeam.shortName}: <span className="text-red-400 font-semibold">{homeInjuredCount}</span>
                </span>
              </div>
            )}
            {awayInjuredCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs text-gray-300">
                  {awayTeam.shortName}: <span className="text-red-400 font-semibold">{awayInjuredCount}</span>
                </span>
              </div>
            )}
            {homeInjuredCount === 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-gray-500">{homeTeam.shortName}: clear</span>
              </div>
            )}
            {awayInjuredCount === 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                <span className="text-xs text-gray-500">{awayTeam.shortName}: clear</span>
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
