/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  fetchTeamSchedule,
  deriveFormFromSchedule,
  deriveTeamHistoryFromSchedule,
  ESPN_PATHS,
} from "@/lib/sports/espn";
import { computeSoccerMatchAnalytics } from "@/lib/sports/soccer/analytics";
import SoccerTeamDashboard from "@/components/soccer/SoccerTeamDashboard";

export const revalidate = 3600;

export default async function SoccerTeamPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const sport = "soccer"; // Default to soccer/eng.1 for now, or handle other soccer leagues
  
  // Fetch team schedule to derive stats
  const schedule = await fetchTeamSchedule(sport, id);
  if (!schedule || schedule.length === 0) notFound();

  const history = deriveTeamHistoryFromSchedule(sport, schedule, id, "all");
  const homeHistory = deriveTeamHistoryFromSchedule(sport, schedule, id, "home");
  const awayHistory = deriveTeamHistoryFromSchedule(sport, schedule, id, "away");

  // We need a dummy analytics call or similar to get team-specific stats
  // For a team page, we can just compute the analytics for the team itself
  
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <Link href="/" className="text-xs text-[#374151] hover:text-[#9CA3AF] transition-colors">
        ← Back to Scoreboard
      </Link>
      
      <SoccerTeamDashboard 
        teamId={id}
        history={history}
        homeHistory={homeHistory}
        awayHistory={awayHistory}
      />
    </div>
  );
}
