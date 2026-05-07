// Formatting utilities for the SportsPulse app

export function aflVenueTimezone(venue: string): string {
  const v = venue.toLowerCase();
  if (v.includes("optus") || v.includes("perth") || v.includes("subiaco") || v.includes("waca")) {
    return "Australia/Perth";
  }
  if (v.includes("adelaide") || v.includes("footy park")) {
    return "Australia/Adelaide";
  }
  if (
    v.includes("darwin") || v.includes("tio") || v.includes("traeger") ||
    v.includes("cazaly") || v.includes("cairns")
  ) {
    return "Australia/Darwin";
  }
  return "Australia/Melbourne";
}

export function formatAFLKickoff(iso: string, venue?: string): string {
  const timeZone = aflVenueTimezone(venue ?? "");
  const date = new Date(iso);
  const formatted = date.toLocaleString("en-AU", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Determine short timezone abbreviation
  let tzAbbr: string;
  if (timeZone === "Australia/Perth") {
    tzAbbr = "AWST";
  } else if (timeZone === "Australia/Darwin") {
    tzAbbr = "ACST";
  } else if (timeZone === "Australia/Adelaide") {
    // ACDT Oct-Mar, ACST Apr-Sep
    const month = date.getMonth(); // 0-indexed
    tzAbbr = month >= 3 && month <= 8 ? "ACST" : "ACDT";
  } else {
    // Australia/Melbourne: AEDT Oct-Mar, AEST Apr-Sep
    const month = date.getMonth();
    tzAbbr = month >= 3 && month <= 8 ? "AEST" : "AEDT";
  }

  return `${formatted} ${tzAbbr}`;
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
