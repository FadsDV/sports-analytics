"use client";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

export default function TopBar({ title }: { title?: string }) {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }));
      setDate(now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
    };
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="fixed top-0 left-[60px] xl:left-[200px] right-0 h-14 bg-surface/95 backdrop-blur-sm border-b border-border z-30 flex items-center px-5 gap-4 transition-colors duration-200">
      <div className="flex-1">
        <h1 className="text-text-1 font-semibold text-base">{title ?? "Today's Games"}</h1>
        <p className="text-text-2 text-xs hidden sm:block">{date}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-text-2 text-sm">
          <span className="text-xs opacity-60">⏱</span>
          <span className="font-mono tabular-nums">{time}</span>
        </div>
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-lg bg-surface2 hover:bg-border flex items-center justify-center text-text-2 hover:text-text-1 transition-all text-sm"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-8 h-8 rounded-lg bg-surface2 hover:bg-border flex items-center justify-center text-text-2 hover:text-text-1 transition-all text-sm"
          title="Refresh"
        >
          ↻
        </button>
      </div>
    </header>
  );
}
