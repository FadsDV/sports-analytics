/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useCallback, useRef } from "react";
import type { BetSlipApiResponse, ExtractedLeg, SlipVerdict } from "@/lib/betslip/types";

// ─── Rating config ────────────────────────────────────────────────────────────

const RATING_CONFIG = {
  good: {
    label:     "Good Slip",
    emoji:     "✅",
    color:     "#22C55E",
    bg:        "#22C55E18",
    border:    "#22C55E40",
    tagline:   "Solid research. This one could go.",
  },
  risky: {
    label:     "High Risk",
    emoji:     "⚠️",
    color:     "#F59E0B",
    bg:        "#F59E0B18",
    border:    "#F59E0B40",
    tagline:   "You're asking for trouble. Possible, but...",
  },
  wtf: {
    label:     "WTF who told you this shit",
    emoji:     "💀",
    color:     "#EF4444",
    bg:        "#EF444418",
    border:    "#EF444440",
    tagline:   "Bookies are laughing. Hard pass.",
  },
} as const;

const LEG_RATING_CONFIG = {
  SOLID: { color: "#22C55E", bg: "#22C55E15", label: "SOLID" },
  RISKY: { color: "#F59E0B", bg: "#F59E0B15", label: "RISKY" },
  YIKES: { color: "#EF4444", bg: "#EF444415", label: "YIKES" },
} as const;

const STAT_EMOJI: Record<string, string> = {
  disposals: "🖐",
  goals:     "⚽",
  marks:     "🫳",
  tackles:   "💪",
  hitouts:   "⬆️",
  behinds:   "🎯",
  kicks:     "👟",
};

// ─── Leg card ─────────────────────────────────────────────────────────────────

function LegCard({ leg, index }: { leg: ExtractedLeg; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const rc = LEG_RATING_CONFIG[leg.rating];

  return (
    <div
      className="rounded-xl border transition-all cursor-pointer"
      style={{ borderColor: rc.color + "40", backgroundColor: rc.bg }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="p-3 flex items-center gap-3">
        {/* Index */}
        <span className="text-[11px] font-black text-text-2 w-4 shrink-0 text-center">{index + 1}</span>

        {/* Stat emoji */}
        <span className="text-lg shrink-0">{STAT_EMOJI[leg.stat] ?? "📊"}</span>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-text-1">{leg.playerName}</span>
            {leg.team && (
              <span className="text-[10px] font-semibold text-text-2 bg-surface2 px-1.5 py-0.5 rounded uppercase">{leg.team}</span>
            )}
          </div>
          <div className="text-xs text-text-2 mt-0.5">
            {leg.direction === "over" ? "+" : "-"}{leg.threshold}+ {leg.stat}
            {leg.odds && <span className="ml-2 font-mono text-text-1">@ {leg.odds.toFixed(2)}</span>}
          </div>
        </div>

        {/* Rating badge */}
        <div className="shrink-0 flex items-center gap-2">
          <span
            className="text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider"
            style={{ color: rc.color, border: `1px solid ${rc.color}50` }}
          >
            {rc.label}
          </span>
          <span className="text-text-2 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2 space-y-1.5" style={{ borderColor: rc.color + "30" }}>
          <p className="text-xs text-text-1 leading-snug">
            <span className="font-semibold">Verdict: </span>{leg.reason}
          </p>
          {leg.aflContext && (
            <p className="text-xs text-text-2 leading-snug">
              <span className="font-semibold text-text-1">Context: </span>{leg.aflContext}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Results panel ─────────────────────────────────────────────────────────────

function ResultsPanel({ verdict, onReset }: { verdict: SlipVerdict; onReset: () => void }) {
  const rc = RATING_CONFIG[verdict.overallRating];

  const solidCount = verdict.legs.filter(l => l.rating === "SOLID").length;
  const riskyCount = verdict.legs.filter(l => l.rating === "RISKY").length;
  const yikesCount = verdict.legs.filter(l => l.rating === "YIKES").length;

  return (
    <div className="space-y-4 slide-in">

      {/* Hero verdict */}
      <div
        className="rounded-2xl border-2 p-5 text-center"
        style={{ borderColor: rc.color, backgroundColor: rc.bg }}
      >
        <div className="text-4xl mb-2">{rc.emoji}</div>
        <div className="text-xl font-black tracking-tight" style={{ color: rc.color }}>
          {rc.label}
        </div>
        <div className="text-sm text-text-2 mt-1">{rc.tagline}</div>

        {/* Leg count bar */}
        <div className="mt-4 flex gap-2 justify-center">
          {solidCount > 0 && (
            <div className="flex items-center gap-1 text-xs bg-[#22C55E18] border border-[#22C55E40] px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span className="font-bold text-[#22C55E]">{solidCount}</span>
              <span className="text-text-2">SOLID</span>
            </div>
          )}
          {riskyCount > 0 && (
            <div className="flex items-center gap-1 text-xs bg-[#F59E0B18] border border-[#F59E0B40] px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
              <span className="font-bold text-[#F59E0B]">{riskyCount}</span>
              <span className="text-text-2">RISKY</span>
            </div>
          )}
          {yikesCount > 0 && (
            <div className="flex items-center gap-1 text-xs bg-[#EF444418] border border-[#EF444440] px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
              <span className="font-bold text-[#EF4444]">{yikesCount}</span>
              <span className="text-text-2">YIKES</span>
            </div>
          )}
          {verdict.totalOdds && verdict.totalOdds > 0 && (
            <div className="flex items-center gap-1 text-xs bg-surface2 border border-border px-2 py-1 rounded-full">
              <span className="text-text-2">Combined</span>
              <span className="font-black text-text-1">@ {verdict.totalOdds.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-2 mb-2">Analysis</div>
        <p className="text-sm text-text-1 leading-relaxed">{verdict.summary}</p>
      </div>

      {/* Per-leg breakdown */}
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-text-2 mb-2 px-1">
          Leg Breakdown — tap to expand
        </div>
        <div className="space-y-2">
          {verdict.legs.map((leg, i) => (
            <LegCard key={i} leg={leg} index={i} />
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        className="w-full py-3 rounded-xl border border-border text-sm font-semibold text-text-2 hover:text-text-1 hover:border-primary/50 transition-all"
      >
        Check Another Slip
      </button>
    </div>
  );
}

// ─── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  onFile,
  preview,
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  inputRef,
}: {
  onFile: (f: File) => void;
  preview: string | null;
  dragging: boolean;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
        ${dragging ? "border-primary bg-primary/10" : preview ? "border-border" : "border-border hover:border-primary/50 hover:bg-surface2/50"}`}
      style={{ minHeight: preview ? "auto" : 220 }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />

      {preview ? (
        <div className="relative">
          <img src={preview} alt="Betslip" className="w-full object-contain max-h-[420px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center pb-4">
            <span className="text-xs font-semibold text-white bg-black/50 px-3 py-1.5 rounded-full border border-white/20">
              Tap to change image
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center h-full" style={{ minHeight: 220 }}>
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <span className="text-2xl">📋</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-text-1">Drop your betslip here</div>
            <div className="text-xs text-text-2 mt-1">or tap to upload — JPG, PNG, WebP</div>
          </div>
          <div className="text-[10px] text-text-2 bg-surface2 px-3 py-1.5 rounded-full border border-border">
            Screenshot from Sportsbet · TAB · Neds · Ladbrokes etc.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function BetSlipChecker() {
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [verdict, setVerdict]   = useState<SlipVerdict | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setVerdict(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  }, [handleFile]);

  const handleReset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setVerdict(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setVerdict(null);

    try {
      const form = new FormData();
      form.append("image", file);

      const res = await fetch("/api/betslip/analyze", {
        method: "POST",
        body: form,
      });

      const data: BetSlipApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error);
        return;
      }

      setVerdict(data.verdict);
    } catch {
      setError("Failed to analyse slip. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className="max-w-xl mx-auto space-y-4">

      {/* Header */}
      <div className="text-center pb-2">
        <div className="text-2xl font-black text-text-1 tracking-tight">🔍 Slip Checker</div>
        <div className="text-sm text-text-2 mt-1">Upload your AFL betslip — we'll tell you what it's worth</div>
        <div className="mt-2 text-[10px] text-primary bg-primary/10 border border-primary/30 px-3 py-1 rounded-full inline-block font-semibold uppercase tracking-wider">
          AFL Only · Beta
        </div>
      </div>

      {/* Results */}
      {verdict && !loading && (
        <ResultsPanel verdict={verdict} onReset={handleReset} />
      )}

      {/* Upload + analyze (shown until result appears) */}
      {!verdict && (
        <>
          <UploadZone
            onFile={handleFile}
            preview={preview}
            dragging={dragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            inputRef={inputRef}
          />

          {/* Analyze button */}
          {file && !loading && (
            <button
              onClick={handleAnalyze}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all
                bg-primary text-white hover:bg-primary/90 active:scale-[0.98]"
            >
              Analyse This Slip
            </button>
          )}

          {/* Loading state */}
          {loading && (
            <div className="bg-surface rounded-xl border border-border p-6 text-center space-y-3">
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <span className="text-sm font-semibold text-text-1">Reading your slip...</span>
              </div>
              <p className="text-xs text-text-2">Extracting legs · Checking AFL form · Rating each pick</p>
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 pt-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    style={{ animation: `livePulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="bg-[#EF444410] border border-[#EF444440] rounded-xl p-4 text-sm text-[#EF4444]">
          <span className="font-bold">Error: </span>{error}
        </div>
      )}

      {/* Disclaimer */}
      {!verdict && (
        <div className="text-[10px] text-text-2 text-center leading-relaxed px-4 pt-2 border-t border-border">
          DegenHUB analysis is for research purposes only. Always gamble responsibly.
          <br />Powered by Google Gemini Vision (free tier).
        </div>
      )}
    </div>
  );
}
