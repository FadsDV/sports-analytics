// Formatting utilities for the SportsPulse app

// Returns "AEST" or "AEDT" for a given Date using the actual UTC offset in Melbourne.
// Uses shortOffset (e.g. "GMT+10" / "GMT+11") which is universally supported.
function getMelbourneTzAbbr(date: Date): "AEST" | "AEDT" {
  try {
    const parts = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      timeZoneName: "shortOffset",
    }).formatToParts(date);
    const offset = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    return offset === "GMT+11" ? "AEDT" : "AEST";
  } catch {
    // Fallback: Apr–Sep = AEST, Oct–Mar = AEDT
    const month = date.getMonth();
    return month >= 3 && month <= 8 ? "AEST" : "AEDT";
  }
}

// All AFL times are displayed in Melbourne time (AEST/AEDT) regardless of venue.
// The venue parameter is kept for API compatibility but is no longer used for tz selection.
export function formatAFLKickoff(iso: string, _venue?: string): string {
  const date = new Date(iso);
  const formatted = date.toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatted} ${getMelbourneTzAbbr(date)}`;
}

// Kept for import compatibility but no longer used for timezone routing.
export function aflVenueTimezone(_venue: string): string {
  return "Australia/Melbourne";
}

export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours > 0 && diffHours < 24) {
    return date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffHours >= 24 && diffHours < 48) {
    return "Tomorrow " + date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffHours < 0 && diffHours > -24) {
    return "Today " + date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-AU", { weekday: "short", month: "short", day: "numeric" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatKickoffFull(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
