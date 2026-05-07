import { Weather } from "@/lib/types";

const WEATHER_EMOJI: Record<string, string> = {
  Clear:           "☀️",
  Cloudy:          "☁️",
  "Partly Cloudy": "⛅",
  Rain:            "🌧️",
  Snowy:           "❄️",
  Storm:           "⛈️",
  Windy:           "🌬️",
  Indoor:          "🏟️",
};

export default function WeatherWidget({ weather }: { weather: Weather }) {
  const emoji = WEATHER_EMOJI[weather.condition] ?? "🌤️";
  const isHarsh =
    weather.windKph > 40 ||
    weather.condition === "Storm" ||
    weather.condition === "Snowy" ||
    weather.condition === "Rain";
  const isIndoor = weather.condition === "Indoor";

  return (
    <div className="bg-[#111827] border border-white/5 rounded-xl p-4">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF] mb-3">Match Weather</h3>
      <div className="flex items-center gap-3">
        <span className="text-2xl leading-none">{emoji}</span>
        <div>
          <div className={`font-medium text-sm ${isHarsh ? "text-[#F59E0B]" : "text-white"}`}>
            {weather.condition}
          </div>
          {!isIndoor && (
            <div className="text-xs text-[#9CA3AF] mt-0.5">
              {weather.tempC}°C · {weather.windKph} km/h · {weather.humidity}% humidity
            </div>
          )}
        </div>
      </div>
      {isHarsh && (
        <div className="mt-3 text-xs text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-lg px-3 py-1.5">
          ⚠️ Conditions may affect play
        </div>
      )}
    </div>
  );
}
