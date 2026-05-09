"use client";

import Image from "next/image";
import { useState } from "react";

interface PlayerAvatarProps {
  src?:       string;
  name:       string;
  size?:      number;
  className?: string;
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

  const base = `rounded-full shrink-0 bg-[#1F2937] overflow-hidden flex items-center justify-center ${className}`;
  const fontSize = Math.max(7, Math.floor(size * 0.37));

  if (src && !failed) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className={base} style={{ width: size, height: size }}>
      <span style={{ fontSize }} className="font-bold text-[#6B7280] leading-none select-none">
        {initials(name)}
      </span>
    </div>
  );
}
