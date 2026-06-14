/* eslint-disable @next/next/no-img-element */
import { Sport } from "@/lib/types";

const CONFIG: Record<Sport, {
  label: string;
  logo?: string;
  cls: string;
}> = {
  soccer:     { label: "EPL",        logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  ucl:        { label: "UCL",        logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",    cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  uel:        { label: "Europa",     logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png", cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  laliga:     { label: "La Liga",    logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  bundesliga: { label: "Bundesliga", logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  aleague:    { label: "A-League",   logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/1308.png", cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  worldcup:   { label: "World Cup",  logo: "https://a.espncdn.com/i/leaguelogos/soccer/500/4.png",   cls: "bg-[#0f172a] text-yellow-400 border-[#1e293b]" },
  basketball: { label: "NBA",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  nfl:        { label: "NFL",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
  afl:        { label: "AFL",        logo: "https://a.espncdn.com/i/teamlogos/leagues/500/afl.png",   cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" },
};

export default function SportBadge({ sport }: { sport: Sport }) {
  const c = CONFIG[sport] ?? { label: sport, cls: "bg-[#0f172a] text-gray-300 border-[#1e293b]" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${c.cls}`}>
      {c.logo && (
        <img src={c.logo} alt={c.label} className="w-3.5 h-3.5 object-contain" />
      )}
      {c.label}
    </span>
  );
}
