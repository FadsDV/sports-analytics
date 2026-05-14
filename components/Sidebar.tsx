"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const NAV_MAIN = [
  { href: "/",               view: "today",    icon: "⊞",  label: "Home"     },
  { href: "/?view=live",     view: "live",     icon: "◉",  label: "Live",    live: true },
  { href: "/?view=today",    view: "today",    icon: "◷",  label: "Today"    },
  { href: "/?view=upcoming", view: "upcoming", icon: "▷",  label: "Upcoming" },
  { href: "/?view=results",  view: "results",  icon: "✓",  label: "Results"  },
];

const NAV_EXPLORE = [
  { href: "/leagues",     icon: "◈", label: "Leagues" },
  { href: "/teams",       icon: "◎", label: "Teams"   },
  { href: "/players",     icon: "◉", label: "Players"  },
  { href: "/sports/cs2",  icon: "⊕", label: "CS2"     },
];

// Inner component uses useSearchParams — must be inside Suspense
function NavLinks() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const currentView  = searchParams.get("view") ?? "today";
  const onHome       = pathname === "/";

  return (
    <>
      {NAV_MAIN.map((item) => {
        const isActive = onHome && (
          item.view === currentView ||
          (item.view === "today" && item.href === "/" && !searchParams.get("view"))
        );
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 px-2 xl:px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? item.live
                  ? "bg-red-500/15 text-red-400"
                  : "bg-[#3B82F6]/15 text-[#3B82F6]"
                : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
            }`}
          >
            <span className={`text-base shrink-0 w-5 text-center ${item.live && !isActive ? "text-red-400/70" : ""}`}>
              {item.icon}
            </span>
            <span className="hidden xl:block truncate">{item.label}</span>
            {item.live && (
              <span className="ml-auto hidden xl:block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </Link>
        );
      })}

      <div className="pt-4 pb-1 hidden xl:block">
        <div className="px-3 text-[10px] font-semibold uppercase tracking-widest text-[#1e3a5f]">
          Explore
        </div>
      </div>
      <div className="pt-2 xl:pt-0 border-t border-white/5 xl:border-0 mt-2 xl:mt-0" />

      {NAV_EXPLORE.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-3 px-2 xl:px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? "bg-[#3B82F6]/15 text-[#3B82F6]"
                : "text-[#9CA3AF] hover:text-white hover:bg-white/5"
            }`}
          >
            <span className="text-base shrink-0 w-5 text-center">{item.icon}</span>
            <span className="hidden xl:block">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

// Fallback nav without active-state logic (used during SSR / hydration)
function NavFallback() {
  return (
    <>
      {NAV_MAIN.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex items-center gap-3 px-2 xl:px-3 py-2.5 rounded-lg text-sm font-medium text-[#9CA3AF] hover:text-white hover:bg-white/5 transition-all"
        >
          <span className={`text-base shrink-0 w-5 text-center ${item.live ? "text-red-400/70" : ""}`}>
            {item.icon}
          </span>
          <span className="hidden xl:block truncate">{item.label}</span>
          {item.live && (
            <span className="ml-auto hidden xl:block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          )}
        </Link>
      ))}
    </>
  );
}

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-[60px] xl:w-[200px] bg-[#0a1628] border-r border-white/5 z-40 flex flex-col">

      {/* Logo */}
      <div className="border-b border-white/[0.07] shrink-0">

        {/* Collapsed sidebar — full 60px width, 40px tall (3:2 ratio) */}
        <div className="flex xl:hidden items-center justify-center py-1">
          <div className="relative w-[58px] h-[39px]">
            <Image
              src="/logo.png"
              alt="DegenHUB"
              fill
              priority
              sizes="58px"
              className="object-contain"
            />
          </div>
        </div>

        {/* Expanded sidebar — full 200px width, 133px tall (3:2 ratio) */}
        <div className="hidden xl:block">
          <div className="relative w-full h-[133px]">
            <Image
              src="/logo.png"
              alt="DegenHUB"
              fill
              priority
              sizes="200px"
              className="object-contain"
            />
          </div>
        </div>

      </div>

      {/* Main nav — wrapped in Suspense for useSearchParams */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
        <Suspense fallback={<NavFallback />}>
          <NavLinks />
        </Suspense>
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-white/5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-2 xl:px-3 py-2.5 rounded-lg text-sm font-medium text-[#9CA3AF] hover:text-white hover:bg-white/5 transition-all"
        >
          <span className="text-base shrink-0 w-5 text-center">⚙</span>
          <span className="hidden xl:block">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
