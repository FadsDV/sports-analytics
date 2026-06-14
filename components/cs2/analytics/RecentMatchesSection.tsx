import type { FormEntry } from "@/lib/esports/analytics/types";
import { SectionCard } from "./SectionCard";
import { MatchResultRow } from "./MatchResultRow";

export function RecentMatchesSection({ entries }: { entries: FormEntry[] }) {
  return (
    <SectionCard label="Recent Matches">
      {entries.length === 0 ? (
        <p className="text-xs text-[#374151]">No recent match data.</p>
      ) : (
        <div>
          {entries.map((e, i) => (
            <MatchResultRow key={`${e.matchId}-${i}`} entry={e} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
