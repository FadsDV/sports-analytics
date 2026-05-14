"use client";

import { useEffect, useState } from "react";

export default function TopBar({ title }: { title?: string }) {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

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
    <header className="fixed top-0 left-[60px] xl:left-[200px] right-0 h-14 bg-[#081220]/95 backdrop-blur-sm border-b border-white/5 z-30 flex items-center px-5 gap-4">
      <div className="flex-1">
        <h1 className="text-white font-semibold text-base">{title ?? "Today's Games"}</h1>
        <p className="text-[#9CA3AF] text-xs hidden sm:block">{date}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-[#9CA3AF] text-sm">
          <span className="text-xs">⏱</span>
          <span className="font-mono tabular-nums">{time}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#9CA3AF] hover:text-white transition-all text-sm"
          title="Refresh"
        >
          ↻
        </button>
      </div>
    </header>
  );
}
