/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

export default function SofaPlayerPhoto({ id, name, size = 28 }: { id: number; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  if (failed) {
    return (
      <div
        className="rounded-full bg-surface2 border border-border flex items-center justify-center shrink-0 text-text-2 font-bold"
        style={{ width: size, height: size, fontSize: size * 0.33 }}
      >{initials}</div>
    );
  }
  return (
    <img
      src={`https://img.sofascore.com/api/v1/player/${id}/image`}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="rounded-full object-cover shrink-0 bg-surface2 border border-border/40"
      style={{ width: size, height: size }}
    />
  );
}
