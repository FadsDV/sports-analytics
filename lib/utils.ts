// Formatting utilities for the SportsPulse app

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
