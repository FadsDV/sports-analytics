/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Game, Team, H2HGame } from "@/lib/types";
import type { AFLInsight } from "@/lib/sports/afl/insights";
import type { ESPNPlayer, ESPNInjury } from "@/lib/sports/espnPlayers";
import type { AFLMatchAnalytics } from "@/lib/sports/afl/analytics";
import type { TeamHistoryGame, VenueFilter } from "@/lib/sports/espn";
import FormPills from "@/components/FormPills";
import PlayerAvatar from "@/components/afl/PlayerAvatar";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AFLDashboardProps {
  game:                 Game;
  homeInjuries:         ESPNInjury[];
  awayInjuries:         ESPNInjury[];
  homeHistory:          TeamHistoryGame[];
  awayHistory:          TeamHistoryGame[];
  h2h:                  H2HGame[];
  analytics:            AFLMatchAnalytics | null;
  insights:             AFLInsight[];
  historyFilter:        VenueFilter;
  onHistoryFilterChange:(f: VenueFilter) => void;
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Card({
  title, children, className = "", accent = false,
}: {
  title?: string; children: React.ReactNode; className?: string; accent?: boolean;
}) {
  return (
    <div className={`bg-surface rounded-xl border border-border overflow-hidden ${accent ? "border-l-2 border-l-primary" : ""} ${className}`}>
      {title && (
        <div className="px-3 py-2 border-b border-border bg-surface2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-2">{title}</span>
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatRow({
  label, value, sub, accent = false,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-2">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${accent ? "text-primary" : "text-text-1"}`}>
        {value}{sub && <span className="text-text-2 ml-1 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

function Badge({
  children, color = "blue",
}: {
  children: React.ReactNode; color?: "blue"|"green"|"yellow"|"red"|"gray";
}) {
  const cls = {
    blue:   "bg-primary/10 text-primary",
    green:  "bg-[#22C55E]/10 text-[#22C55E]",
    yellow: "bg-[#F59E0B]/10 text-[#F59E0B]",
    red:    "bg-[#EF4444]/10 text-[#EF4444]",
    gray:   "bg-surface2 text-text-2",
  }[color];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>{children}</span>
  );
}

function ResultPill({ result }: { result: "W" | "L" | "D" | null }) {
  if (!result) return null;
  const cls = result === "W"
    ? "bg-[#22C55E]/20 text-[#22C55E]"
    : result === "L"
    ? "bg-[#EF4444]/20 text-[#EF4444]"
    : "bg-[#F59E0B]/20 text-[#F59E0B]";
  return (
    <span className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0 ${cls}`}>{result}</span>
  );
}

// ─── Derived analytics ─────────────────────────────────────────────────────────

function computeWinProb(
  analytics: AFLMatchAnalytics | null,
  h2h: H2HGame[],
  homeTeamName: string,
): { home: number; away: number } {
  if (!analytics) return { home: 50, away: 50 };
  const ha = analytics.home;
  const aa = analytics.away;

  const formLen   = Math.max(ha.form.length, aa.form.length, 1);
  const homeFormS = ha.form.filter(r => r === "W").length / formLen;
  const awayFormS = aa.form.filter(r => r === "W").length / formLen;

  const homeTotal = ha.record.wins + ha.record.losses;
  const awayTotal = aa.record.wins + aa.record.losses;
  const homeRecS  = homeTotal > 0 ? ha.record.wins / homeTotal : 0.5;
  const awayRecS  = awayTotal > 0 ? aa.record.wins / awayTotal : 0.5;

  const n        = h2h.length;
  const homeH2HW = n > 0 ? h2h.filter(g => g.winner === homeTeamName).length / n : 0.5;
  const awayH2HW = n > 0 ? 1 - homeH2HW - h2h.filter(g => g.winner === "Draw").length / n : 0.5;

  const homeRaw = homeFormS * 0.35 + homeRecS * 0.35 + homeH2HW * 0.15 + 0.55 * 0.15;
  const awayRaw = awayFormS * 0.35 + awayRecS * 0.35 + awayH2HW * 0.15 + 0.45 * 0.15;
  const total   = homeRaw + awayRaw;

  const homeProb = Math.max(5, Math.min(95, Math.round((homeRaw / total) * 100)));
  return { home: homeProb, away: 100 - homeProb };
}

// ─── WEATHER ICON MAP ─────────────────────────────────────────────────────────

const WEATHER_ICONS: Record<string, string> = {
  Clear:"☀️","Partly Cloudy":"⛅",Cloudy:"☁️",Rain:"🌧️","Rain Showers":"🌧️",
  Drizzle:"🌦️",Storm:"⛈️",Snow:"❄️","Snow Showers":"❄️",Foggy:"🌫️",
};

// ─── PRE-MATCH DASHBOARD ──────────────────────────────────────────────────────

function AFLPreMatch({
  game, homeInjuries, awayInjuries,
  homeHistory, awayHistory, h2h, analytics, insights,
  historyFilter, onHistoryFilterChange,
}: AFLDashboardProps) {
  const { homeTeam, awayTeam, weather } = game;
  const ha   = analytics?.home;
  const aa   = analytics?.away;
  const prob = computeWinProb(analytics, h2h, homeTeam.name);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* ══════════════════════════════════════════
          LEFT — Intelligence
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Win Probability */}
        <Card title="Win Probability" accent>
          <div className="space-y-3">
            {([
              { t: homeTeam, p: prob.home, role: "Home" },
              { t: awayTeam, p: prob.away, role: "Away" },
            ] as const).map(({ t, p, role }) => (
              <div key={t.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain shrink-0" />}
                    <span className="text-xs font-medium text-text-1 truncate">{t.shortName}</span>
                    <span className="text-[10px] text-text-2">{role}</span>
                  </div>
                  <span className={`text-base font-black tabular-nums ${
                    p >= 55 ? "text-[#22C55E]" : p >= 45 ? "text-[#F59E0B]" : "text-text-2"
                  }`}>{p}%</span>
                </div>
                <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${p >= 55 ? "bg-[#22C55E]" : p >= 45 ? "bg-[#F59E0B]" : "bg-text-2/40"}`}
                    style={{ width: `${p}%` }}
                  />
                </div>
              </div>
            ))}

            {/* Predicted margin highlight */}
            {analytics?.predictedMargin != null && (
              <div className="mt-1 bg-primary/8 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-[10px] text-text-2 uppercase tracking-wide">Model margin</span>
                <span className="text-sm font-bold text-primary">
                  {analytics.predictedMargin >= 0 ? homeTeam.shortName : awayTeam.shortName}
                  {" by ~"}{Math.abs(analytics.predictedMargin)} pts
                </span>
              </div>
            )}
          </div>
        </Card>

        {/* Value Intelligence (placeholder) */}
        <Card title="Value Intelligence">
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {([
              { label: "Home Win",   line: "—" },
              { label: "Away Win",   line: "—" },
              { label: "Line",       line: "—" },
              { label: "Total",      line: "—" },
            ]).map(item => (
              <div key={item.label} className="bg-bg rounded-lg px-2.5 py-2 flex flex-col gap-1.5">
                <span className="text-[10px] font-medium text-text-2 uppercase tracking-wide">{item.label}</span>
                <span className="text-lg font-black text-text-2 tabular-nums">{item.line}</span>
                <Badge color="gray">locked</Badge>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-text-2 text-center">Odds integration coming soon</p>
        </Card>

        {/* Venue Intelligence */}
        {ha && (
          <Card title="Venue &amp; Record">
            {ha.venueRecord && (
              <StatRow
                label={`${homeTeam.shortName} at venue`}
                value={`${ha.venueRecord.wins}W ${ha.venueRecord.losses}L`}
                accent
              />
            )}
            <StatRow label={`${homeTeam.shortName} home`} value={`${ha.homeRecord.wins}W ${ha.homeRecord.losses}L`} />
            <StatRow label={`${awayTeam.shortName} away`} value={aa ? `${aa.awayRecord.wins}W ${aa.awayRecord.losses}L` : "—"} />
            {ha.daysRest != null && (
              <StatRow
                label={`${homeTeam.shortName} rest`}
                value={`${ha.daysRest}d`}
                accent={ha.daysRest < 7}
              />
            )}
            {aa?.daysRest != null && (
              <StatRow
                label={`${awayTeam.shortName} rest`}
                value={`${aa.daysRest}d`}
                accent={aa.daysRest < 7}
              />
            )}
          </Card>
        )}

        {/* Key Edges */}
        {insights.length > 0 && (
          <Card title="Key Edges" accent>
            <div className="space-y-0">
              {insights.map((ins, i) => {
                const dot = ins.severity === "high"
                  ? "bg-[#EF4444]"
                  : ins.severity === "medium"
                  ? "bg-[#F59E0B]"
                  : "bg-[#22C55E]";
                const dirCls = ins.direction === "home"
                  ? "text-primary bg-primary/10"
                  : ins.direction === "away"
                  ? "text-text-2 bg-surface2"
                  : "";
                return (
                  <div key={ins.id || i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-text-1 leading-none">{ins.title}</span>
                        {ins.direction !== "neutral" && (
                          <span className={`text-[9px] font-bold px-1 py-px rounded uppercase tracking-wide ${dirCls}`}>
                            {ins.direction}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-2 leading-snug">{ins.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════
          CENTER — Matchup
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Form & Season Record */}
        <Card title="Form &amp; Season Record">
          <div className="grid grid-cols-2 gap-5">
            {([
              { t: homeTeam, an: ha, role: "Home" },
              { t: awayTeam, an: aa, role: "Away" },
            ] as const).map(({ t, an, role }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1.5 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                  <span className="text-sm font-semibold text-text-1 truncate">{t.shortName}</span>
                  <span className="text-[10px] text-text-2">{role}</span>
                  {an?.streak.type && an.streak.count >= 2 && (
                    <span className={`ml-auto text-[10px] font-bold px-1 py-px rounded ${
                      an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
                    }`}>{an.streak.count}{an.streak.type}</span>
                  )}
                </div>
                <FormPills form={t.form} />
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-2">Season</span>
                    <span className="text-text-1 font-medium tabular-nums">
                      {t.record.wins}W {t.record.losses}L{t.record.draws ? ` ${t.record.draws}D` : ""}
                    </span>
                  </div>
                  {an && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-2">Avg scored</span>
                        <span className="text-text-1 font-medium tabular-nums">{an.avgScored} pts</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-2">Avg conceded</span>
                        <span className="text-text-1 font-medium tabular-nums">{an.avgConceded} pts</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Team Comparison bars */}
        {ha && aa && (
          <Card title="Team Comparison">
            {([
              { key: "Avg Scored",   hv: ha.avgScored,     av: aa.avgScored     },
              { key: "Avg Conceded", hv: ha.avgConceded,   av: aa.avgConceded   },
              { key: "Win Margin",   hv: ha.avgMarginWin,  av: aa.avgMarginWin  },
              { key: "Loss Margin",  hv: ha.avgMarginLoss, av: aa.avgMarginLoss },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key} className="mb-2.5 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-1 font-semibold tabular-nums w-8">{hv}</span>
                    <span className="text-text-2 uppercase text-[10px] tracking-wide flex-1 text-center">{key}</span>
                    <span className="text-text-2 tabular-nums w-8 text-right">{av}</span>
                  </div>
                  <div className="flex gap-0.5 h-[3px]">
                    <div className="flex-1 bg-surface2 rounded-full overflow-hidden flex justify-end">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(hv / max) * 100}%` }} />
                    </div>
                    <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-text-2/40 rounded-full" style={{ width: `${(av / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {/* H2H */}
        {h2h.length > 0 && (
          <Card title="Head-to-Head">
            {/* Win summary */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border">
              {(() => {
                const hw = h2h.filter(g => g.winner === homeTeam.name).length;
                const dr = h2h.filter(g => g.winner === "Draw").length;
                const aw = h2h.length - hw - dr;
                return (
                  <>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-primary tabular-nums">{hw}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">{homeTeam.shortName}</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-[#F59E0B] tabular-nums">{dr}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">Draws</div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-2xl font-black text-text-2 tabular-nums">{aw}</div>
                      <div className="text-[10px] text-text-2 mt-0.5">{awayTeam.shortName}</div>
                    </div>
                  </>
                );
              })()}
            </div>
            {/* Meeting rows */}
            {h2h.slice(0, 5).map((g, i) => {
              const isHW = g.winner === homeTeam.name;
              const isAW = g.winner === awayTeam.name;
              return (
                <Link key={g.gameId || i} href={g.gameId ? `/game/${g.gameId}` : "#"}
                  className="flex items-center gap-1.5 py-1.5 border-b border-border last:border-0 hover:bg-surface2 rounded px-0.5 text-xs group">
                  <span className="text-[10px] text-text-2 w-16 shrink-0 tabular-nums">{g.date}</span>
                  <span className={`flex-1 truncate text-right ${isHW ? "text-white font-semibold" : "text-text-2"}`}>{g.homeTeam}</span>
                  <span className="font-bold text-text-1 tabular-nums w-12 text-center shrink-0 text-[11px]">{g.score}</span>
                  <span className={`flex-1 truncate ${isAW ? "text-white font-semibold" : "text-text-2"}`}>{g.awayTeam}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                    isHW ? "bg-primary/20 text-primary" : isAW ? "bg-white/10 text-text-2" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                  }`}>{isHW ? "H" : isAW ? "A" : "D"}</span>
                </Link>
              );
            })}
          </Card>
        )}

        {/* Recent Results */}
        <Card title="Recent Results">
          <div className="flex gap-1.5 mb-3">
            {(["all", "home", "away"] as VenueFilter[]).map(f => (
              <button key={f} onClick={() => onHistoryFilterChange(f)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  historyFilter === f
                    ? "text-primary bg-primary/10 font-medium"
                    : "text-text-2 hover:text-text-2"
                }`}>
                {f === "all" ? "All" : f === "home" ? "Home" : "Away"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {([{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }] as const).map(({ t, h }) => (
              <div key={t.name}>
                <div className="flex items-center gap-1 mb-2">
                  {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-text-2">{t.shortName}</span>
                </div>
                {h.slice(0, 5).map(g => (
                  <Link key={g.gameId} href={`/game/${g.gameId}`}
                    className="flex items-center justify-between py-1.5 border-b border-border last:border-0 hover:bg-surface2 px-0.5 rounded text-xs group">
                    <span className="text-text-2 truncate max-w-[55%]">{g.opponent}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {g.result && <ResultPill result={g.result} />}
                      <span className={`font-semibold tabular-nums ${
                        g.result === "W" ? "text-[#22C55E]" : g.result === "L" ? "text-[#EF4444]" : "text-[#F59E0B]"
                      }`}>{g.score ?? "—"}</span>
                    </div>
                  </Link>
                ))}
                {h.length === 0 && <p className="text-xs text-text-2">No data</p>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT — Context
      ══════════════════════════════════════════ */}
      <div className="space-y-3 md:col-span-2 lg:col-span-1">

        {/* Weather */}
        {weather && weather.condition !== "Indoor" && (
          <Card title="Conditions">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{WEATHER_ICONS[weather.condition] ?? "🌤"}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold ${
                  weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-text-1"
                }`}>{weather.condition}</div>
                <div className="text-xs text-text-2 mt-0.5">{weather.tempC}°C · {weather.windKph} km/h wind</div>
              </div>
              {weather.windKph > 40 && <Badge color="yellow">Windy</Badge>}
              {["Storm","Rain"].includes(weather.condition) && <Badge color="yellow">Impact</Badge>}
            </div>
            {weather.windKph > 30 && (
              <p className="mt-2.5 text-xs text-[#F59E0B] border-t border-border pt-2.5 leading-snug">
                ⚠ Strong wind may reduce scoring and favour kicks into wind
              </p>
            )}
          </Card>
        )}

        {/* Team News */}
        {(ha?.injuryImpact || aa?.injuryImpact) && (
          <Card title="Team News">
            {([{ t: homeTeam, an: ha }, { t: awayTeam, an: aa }] as const).map(({ t, an }) => {
              if (!an) return null;
              const { out, doubtful } = an.injuryImpact;
              const hasAny = out.length > 0 || doubtful.length > 0;
              return (
                <div key={t.name} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                  </div>
                  {!hasAny && <p className="text-xs text-[#22C55E]">✓ No injuries reported</p>}
                  {out.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <PlayerAvatar
                        src={p.headshot}
                        name={p.playerName}
                        size={22}
                      />
                      <span className="text-xs text-text-1 truncate flex-1">{p.playerName}</span>
                      <Badge color="red">Out</Badge>
                    </div>
                  ))}
                  {doubtful.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <PlayerAvatar
                        src={p.headshot}
                        name={p.playerName}
                        size={22}
                      />
                      <span className="text-xs text-text-1 truncate flex-1">{p.playerName}</span>
                      <Badge color="yellow">Doubtful</Badge>
                    </div>
                  ))}
                </div>
              );
            })}
          </Card>
        )}

        {/* Player Props Placeholder */}
        <Card title="Player Props">
          <div className="space-y-2">
            {([
              { label: "Disposals line", example: "O/U 25.5" },
              { label: "Goal scorer",    example: "Anytime" },
              { label: "Tackle line",    example: "O/U 5.5" },
              { label: "Fantasy score",  example: "O/U 100" },
            ]).map(item => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <div className="text-xs text-text-2">{item.label}</div>
                  <div className="text-[10px] text-[#2D3748] mt-0.5">{item.example}</div>
                </div>
                <Badge color="gray">locked</Badge>
              </div>
            ))}
            <p className="text-[10px] text-text-2 text-center pt-1">Connect odds feed to unlock</p>
          </div>
        </Card>

      </div>
    </div>
  );
}

// ─── LIVE / FINISHED DASHBOARD ────────────────────────────────────────────────

function AFLLive({
  game, homeInjuries, awayInjuries,
  homeHistory, awayHistory, h2h, analytics, insights,
  historyFilter, onHistoryFilterChange,
}: AFLDashboardProps) {
  const { homeTeam, awayTeam, boxScore, weather, status } = game;
  const ha = analytics?.home;
  const aa = analytics?.away;
  const isLive = status === "live";

  const KEY_STATS = ["D", "G", "T", "M", "HO"] as const;
  const topHome = boxScore?.home.slice(0, 10) ?? [];
  const topAway = boxScore?.away.slice(0, 10) ?? [];
  const hasBoxScore = topHome.length > 0 || topAway.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[260px_1fr_240px] gap-3">

      {/* ══════════════════════════════════════════
          LEFT — Leaders
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Disposal Leaders */}
        {hasBoxScore && (
          <Card title="Disposal Leaders">
            <div className="space-y-3">
              {([{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }] as const).map(({ t, rows }) => {
                const sorted = [...rows]
                  .sort((a, b) => Number(b.stats["D"] ?? 0) - Number(a.stats["D"] ?? 0))
                  .slice(0, 5);
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    {sorted.map((row, i) => {
                      const d     = Number(row.stats["D"] ?? 0);
                      const elite = d >= 25;
                      return (
                        <div key={i} className="flex items-center py-1.5 border-b border-border last:border-0 gap-2">
                          <span className="text-[10px] text-text-2 tabular-nums w-3 shrink-0 text-center">{i + 1}</span>
                          <PlayerAvatar src={(row as any).headshot} name={row.player} size={22} />
                          <span className="text-xs text-text-1 font-medium flex-1 truncate">{row.player}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {KEY_STATS.filter(k => row.stats[k] != null).slice(0, 3).map(k => (
                              <span key={k} className="text-[10px] tabular-nums">
                                <span className="text-text-2">{k} </span>
                                <span className={k === "D" && elite ? "text-primary font-bold" : "text-text-2"}>
                                  {row.stats[k]}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Goal Kickers */}
        {hasBoxScore && (
          <Card title="Goal Kickers">
            <div className="space-y-3">
              {([{ t: homeTeam, rows: topHome }, { t: awayTeam, rows: topAway }] as const).map(({ t, rows }) => {
                const scorers = rows
                  .filter(r => Number(r.stats["G"] ?? 0) > 0)
                  .sort((a, b) => Number(b.stats["G"] ?? 0) - Number(a.stats["G"] ?? 0))
                  .slice(0, 4);
                if (scorers.length === 0) return null;
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    {scorers.map((row, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                        <PlayerAvatar src={(row as any).headshot} name={row.player} size={22} />
                        <span className="text-xs text-text-1 font-medium flex-1 truncate">{row.player}</span>
                        <span className="text-xs font-bold text-[#22C55E] tabular-nums shrink-0">
                          {row.stats["G"]}g {row.stats["B"] ?? 0}b
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Team Averages */}
        {ha && aa && (
          <Card title="Season Averages">
            {([
              { key: "Avg Scored",   hv: ha.avgScored,   av: aa.avgScored   },
              { key: "Avg Conceded", hv: ha.avgConceded, av: aa.avgConceded },
            ] as { key: string; hv: number; av: number }[]).map(({ key, hv, av }) => {
              const max = Math.max(hv, av, 1);
              return (
                <div key={key} className="mb-2.5 last:mb-0">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-1 font-semibold tabular-nums w-8">{hv}</span>
                    <span className="text-text-2 uppercase text-[10px] tracking-wide flex-1 text-center">{key}</span>
                    <span className="text-text-2 tabular-nums w-8 text-right">{av}</span>
                  </div>
                  <div className="flex gap-0.5 h-[3px]">
                    <div className="flex-1 bg-surface2 rounded-full overflow-hidden flex justify-end">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(hv/max)*100}%` }} />
                    </div>
                    <div className="flex-1 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-text-2/40 rounded-full" style={{ width: `${(av/max)*100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </div>

      {/* ══════════════════════════════════════════
          CENTER — Match State
      ══════════════════════════════════════════ */}
      <div className="space-y-3">

        {/* Full Box Score */}
        {hasBoxScore && boxScore && (
          <Card title="Player Stats">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {([{ t: homeTeam, rows: boxScore.home }, { t: awayTeam, rows: boxScore.away }] as const).map(({ t, rows }) => {
                const showHeaders = boxScore.statHeaders.slice(0, 6);
                return (
                  <div key={t.name}>
                    <div className="flex items-center gap-1.5 mb-2">
                      {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                      <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[260px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-1.5 pr-2 text-text-2 font-medium">Player</th>
                            {showHeaders.map(h => (
                              <th key={h} className="text-right py-1.5 px-1 text-text-2 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.slice(0, 10).map((r, i) => (
                            <tr key={i} className="border-b border-border last:border-0 hover:bg-surface2">
                              <td className="py-1.5 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <PlayerAvatar src={r.headshot} name={r.player} size={20} />
                                  <span className="text-text-1 truncate max-w-[80px]">{r.player}</span>
                                </div>
                              </td>
                              {showHeaders.map(h => {
                                const v  = r.stats[h];
                                const hi = h === "D" && Number(v) >= 25;
                                return (
                                  <td key={h} className={`py-1.5 px-1 text-right tabular-nums ${
                                    hi ? "text-primary font-bold" : "text-text-2"
                                  }`}>
                                    {v ?? "—"}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Match Context */}
        {ha && aa && (
          <Card title="Form Context">
            <div className="grid grid-cols-2 gap-4">
              {([{ t: homeTeam, an: ha, role: "Home" }, { t: awayTeam, an: aa, role: "Away" }] as const).map(({ t, an, role }) => (
                <div key={t.name}>
                  <div className="flex items-center gap-1.5 mb-2">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 object-contain" />}
                    <span className="text-xs font-semibold text-text-1">{t.shortName}</span>
                    {an.streak.type && an.streak.count >= 2 && (
                      <span className={`ml-auto text-[10px] font-bold px-1 py-px rounded ${
                        an.streak.type === "W" ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]"
                      }`}>{an.streak.count}{an.streak.type}</span>
                    )}
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {an.form.map((r, i) => (
                      <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                        r === "W" ? "bg-[#22C55E]/20 text-[#22C55E]" : r === "L" ? "bg-[#EF4444]/20 text-[#EF4444]" : "bg-[#F59E0B]/20 text-[#F59E0B]"
                      }`}>{r}</span>
                    ))}
                  </div>
                  <StatRow label="Season" value={`${an.record.wins}W ${an.record.losses}L`} />
                  <StatRow label="Avg pts" value={`${an.avgScored}`} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Momentum (placeholder) */}
        <Card title="Live Momentum">
          <div className="flex items-center justify-center h-14">
            <div className="text-center">
              <div className="text-xs text-text-2">Quarter-by-quarter momentum</div>
              <div className="text-[10px] text-[#2D3748] mt-1">Coming soon</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT — Intelligence
      ══════════════════════════════════════════ */}
      <div className="space-y-3 md:col-span-2 lg:col-span-1">

        {/* Live pulse indicator */}
        {isLive && (
          <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)] shrink-0" />
            <div>
              <div className="text-sm font-bold text-red-400 tracking-wide">LIVE</div>
              <div className="text-xs text-text-2 mt-0.5">Stats update every 15s</div>
            </div>
          </div>
        )}

        {/* Weather (compact) */}
        {weather && weather.condition !== "Indoor" && (
          <Card title="Conditions">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{WEATHER_ICONS[weather.condition] ?? "🌤"}</span>
              <div>
                <div className={`text-sm font-semibold ${
                  weather.windKph > 40 || ["Storm","Rain"].includes(weather.condition) ? "text-[#F59E0B]" : "text-text-1"
                }`}>{weather.condition}</div>
                <div className="text-xs text-text-2 mt-0.5">{weather.tempC}°C · {weather.windKph} km/h</div>
              </div>
            </div>
          </Card>
        )}

        {/* Team News */}
        {(ha?.injuryImpact || aa?.injuryImpact) && (
          <Card title="Team News">
            {([{ t: homeTeam, an: ha }, { t: awayTeam, an: aa }] as const).map(({ t, an }) => {
              if (!an) return null;
              const { out, doubtful } = an.injuryImpact;
              return (
                <div key={t.name} className="mb-2.5 last:mb-0">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                    <span className="text-xs font-semibold text-text-2">{t.shortName}</span>
                  </div>
                  {out.length === 0 && doubtful.length === 0 && (
                    <p className="text-xs text-[#22C55E]">✓ No changes</p>
                  )}
                  {out.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <PlayerAvatar
                        src={p.headshot}
                        name={p.playerName}
                        size={20}
                      />
                      <span className="text-xs text-text-1 flex-1 truncate">{p.playerName}</span>
                      <span className="text-[10px] font-semibold text-[#EF4444]">Out</span>
                    </div>
                  ))}
                  {doubtful.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
                      <PlayerAvatar
                        src={p.headshot}
                        name={p.playerName}
                        size={20}
                      />
                      <span className="text-xs text-text-1 flex-1 truncate">{p.playerName}</span>
                      <span className="text-[10px] font-semibold text-[#F59E0B]">Doubt</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </Card>
        )}

        {/* Pre-game context (top insights) */}
        {insights.length > 0 && (
          <Card title="Pre-Game Context">
            <div className="space-y-0">
              {insights.slice(0, 5).map((ins, i) => {
                const dot = ins.severity === "high"
                  ? "bg-[#EF4444]"
                  : ins.severity === "medium"
                  ? "bg-[#F59E0B]"
                  : "bg-[#22C55E]";
                const dirCls = ins.direction === "home"
                  ? "text-primary bg-primary/10"
                  : ins.direction === "away"
                  ? "text-text-2 bg-surface2"
                  : "";
                return (
                  <div key={ins.id || i} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[5px] ${dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-text-1 leading-none">{ins.title}</span>
                        {ins.direction !== "neutral" && (
                          <span className={`text-[9px] font-bold px-1 py-px rounded uppercase tracking-wide ${dirCls}`}>
                            {ins.direction}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-2 leading-snug">{ins.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Form (compact) */}
        <Card title="Recent Form">
          {([{ t: homeTeam, h: homeHistory }, { t: awayTeam, h: awayHistory }] as const).map(({ t, h }) => (
            <div key={t.name} className="mb-2.5 last:mb-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                {t.logoUrl && <img src={t.logoUrl} alt="" className="w-3.5 h-3.5 object-contain" />}
                <span className="text-xs font-medium text-text-2">{t.shortName}</span>
              </div>
              <div className="flex gap-1">
                {h.slice(0, 5).map((g, i) => <ResultPill key={i} result={g.result} />)}
                {h.length === 0 && <span className="text-xs text-text-2">No data</span>}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function AFLDashboard(props: AFLDashboardProps) {
  if (props.game.status === "upcoming") {
    return <AFLPreMatch {...props} />;
  }
  return <AFLLive {...props} />;
}
