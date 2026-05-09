import { getAFLHeadshotSync } from "./sports/afl/fantasyMapper";

export function aflHeadshotUrl(playerId: string, playerName?: string): string {
  return getAFLHeadshotSync(playerId, playerName);
}
