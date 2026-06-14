"use client";

import Image from "next/image";
import { useState, useMemo } from "react";

interface PlayerAvatarProps {
  src?:       string;
  name:       string;
  size?:      number;
  className?: string;
}

/**
 * Generates a deterministic accent color from a string hash.
 * Returns a color that looks premium against dark backgrounds.
 */
function getAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [210, 200, 190, 220, 230, 240, 250]; // Professional blues/slates
  const h = hues[Math.abs(hash) % hues.length];
  return `hsl(${h}, 70%, 60%)`; // Clean, vibrant but professional
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function PlayerAvatar({ src, name, size = 24, className = "" }: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  
  const accentColor = useMemo(() => getAccentColor(name), [name]);
  const playerInitials = useMemo(() => initials(name), [name]);

  const base = `rounded-full shrink-0 bg-[#0F172A] border border-white/5 overflow-hidden flex items-center justify-center transition-all ${className}`;
  const fontSize = Math.max(7, Math.floor(size * 0.38));

  // Debug logging for the attempted URL
  if (src && !failed) {
    console.debug(`[SportsPulse] Attempting AFL Headshot: ${name} (${src})`);
  }

  if (src && !failed) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="object-cover w-full h-full animate-in fade-in duration-300"
          onError={() => {
            console.warn(`[SportsPulse] AFL Headshot failed: ${name} (${src})`);
            setFailed(true);
          }}
          unoptimized // AFL images are often small/external, prevent double-processing if problematic
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div 
      className={base} 
      style={{ 
        width: size, 
        height: size,
        boxShadow: `inset 0 0 0 1px ${accentColor}15` // Subtle internal glow
      }}
    >
      <span 
        style={{ fontSize, color: accentColor }} 
        className="font-black leading-none select-none tracking-tighter"
      >
        {playerInitials}
      </span>
    </div>
  );
}
