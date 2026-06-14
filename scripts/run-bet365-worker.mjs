#!/usr/bin/env node
/**
 * Bet365 AFL worker runner for a 24/7 mini PC / Claude Cowork routine.
 *
 * This script:
 *   1. Fetches upcoming AFL games from ESPN
 *   2. Maintains one local job file per game under data/local/
 *   3. Starts Bet365 capture attempts once a game is within 5 hours of bounce
 *   4. Keeps recapturing on a refresh interval while the event window is active
 *   5. Deletes local state/captures 10 hours after the game starts
 *
 * Current limitation:
 *   scripts/scrape-bet365.mjs still does raw capture only; the parser/upload
 *   hook is not fully implemented yet. This runner still gives us the full
 *   routine, retention, and handoff shape so the parser can drop in cleanly.
 *
 * Usage:
 *   node scripts/run-bet365-worker.mjs --upload https://your-app.vercel.app
 *   node scripts/run-bet365-worker.mjs --upload http://localhost:3000 --dry-run
 */

import { execFile } from "child_process";
import { promisify } from "util";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const STATE_DIR = join(REPO_ROOT, "data", "local", "bet365-worker");
const JOBS_DIR = join(STATE_DIR, "jobs");
const CAPTURE_DIR = join(STATE_DIR, "captures");

const FIRST_SCRAPE_BEFORE_MS = 24 * 60 * 60 * 1000;
const FINAL_SCRAPE_BEFORE_MS = 1 * 60 * 60 * 1000;
const DELETE_AFTER_MS = 10 * 60 * 60 * 1000;
const DEFAULT_REFRESH_MS = 30 * 60 * 1000;
const RETRY_AFTER_NO_DATA_MS = 60 * 60 * 1000;
const DEFAULT_DAYS_AHEAD = 6;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/australian-football/afl";

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const uploadIdx = args.indexOf("--upload");
const uploadBase = uploadIdx !== -1 ? args[uploadIdx + 1] ?? null : null;
const dryRun = args.includes("--dry-run");
const headless = args.includes("--headless");
const force = args.includes("--force");
const gameIdIdx = args.indexOf("--gameId");
const targetGameId = gameIdIdx !== -1 ? args[gameIdIdx + 1] ?? null : null;
const daysAheadIdx = args.indexOf("--daysAhead");
const daysAhead = daysAheadIdx !== -1 ? Number(args[daysAheadIdx + 1] ?? "") : DEFAULT_DAYS_AHEAD;
const refreshIdx = args.indexOf("--refreshMinutes");
const refreshMinutes = refreshIdx !== -1 ? Number(args[refreshIdx + 1] ?? "") : DEFAULT_REFRESH_MS / 60_000;

if (!uploadBase) {
  console.error("Usage: node scripts/run-bet365-worker.mjs --upload https://your-app.vercel.app");
  process.exit(1);
}

if (!Number.isFinite(daysAhead) || daysAhead < 0) {
  console.error("Error: --daysAhead must be a non-negative number");
  process.exit(1);
}

if (!Number.isFinite(refreshMinutes) || refreshMinutes <= 0) {
  console.error("Error: --refreshMinutes must be a positive number");
  process.exit(1);
}

const refreshMs = refreshMinutes * 60_000;

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function jobPath(gameId) {
  return join(JOBS_DIR, `${gameId}.json`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function loadJob(gameId) {
  const path = jobPath(gameId);
  if (!existsSync(path)) return null;
  try {
    return readJson(path);
  } catch {
    return null;
  }
}

function saveJob(job) {
  writeJson(jobPath(job.gameId), job);
}

function formatISO(ms) {
  return new Date(ms).toISOString();
}

function dateRange(days) {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  return `${fmt(start)}-${fmt(end)}`;
}

async function fetchUpcomingAFLGames() {
  const url = `${ESPN_BASE}/scoreboard?limit=50&dates=${dateRange(daysAhead)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "SportsPulse/1.0 personal" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ESPN scoreboard failed: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const events = Array.isArray(data.events) ? data.events : [];

  return events
    .map((ev) => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find((c) => c.homeAway === "home");
      const away = comp?.competitors?.find((c) => c.homeAway === "away");
      if (!comp || !home || !away || !ev.date) return null;

      const kickoffMs = new Date(ev.date).getTime();
      if (!Number.isFinite(kickoffMs)) return null;

      return {
        gameId: `afl-${ev.id}`,
        espnEventId: String(ev.id),
        homeTeam: home.team?.displayName ?? home.team?.name ?? "Home",
        awayTeam: away.team?.displayName ?? away.team?.name ?? "Away",
        kickoffMs,
        kickoffISO: ev.date,
        firstScrapeAtMs: kickoffMs - FIRST_SCRAPE_BEFORE_MS,
        finalScrapeAtMs: kickoffMs - FINAL_SCRAPE_BEFORE_MS,
        expiresAtMs: kickoffMs + DELETE_AFTER_MS,
        state: ev.status?.type?.state ?? comp.status?.type?.state ?? "pre",
      };
    })
    .filter((game) => game && game.expiresAtMs > Date.now());
}

function syncJobs(games) {
  const synced = [];

  for (const game of games) {
    const existing = loadJob(game.gameId);
    const now = new Date().toISOString();

    const job = {
      gameId: game.gameId,
      espnEventId: game.espnEventId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      kickoffMs: game.kickoffMs,
      kickoffISO: game.kickoffISO,
      firstScrapeAtMs: game.firstScrapeAtMs,
      finalScrapeAtMs: game.finalScrapeAtMs,
      expiresAtMs: game.expiresAtMs,
      state: game.state,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAttemptAt: existing?.lastAttemptAt ?? null,
      lastCaptureAt: existing?.lastCaptureAt ?? null,
      lastExitCode: existing?.lastExitCode ?? null,
      lastStatus: existing?.lastStatus ?? null,
      firstScheduledAttemptAt: existing?.firstScheduledAttemptAt ?? null,
      finalScheduledAttemptAt: existing?.finalScheduledAttemptAt ?? null,
      retryAfterMs: existing?.retryAfterMs ?? null,
      lastError: existing?.lastError ?? null,
    };

    saveJob(job);
    synced.push(job);
  }

  return synced;
}

function cleanupExpiredState(nowMs) {
  ensureDir(JOBS_DIR);
  ensureDir(CAPTURE_DIR);

  let deletedJobs = 0;
  let deletedCaptures = 0;

  for (const file of readdirSync(JOBS_DIR)) {
    if (!file.endsWith(".json")) continue;
    const path = join(JOBS_DIR, file);
    let job;
    try {
      job = readJson(path);
    } catch {
      continue;
    }

    if (typeof job.expiresAtMs !== "number" || job.expiresAtMs > nowMs) continue;
    rmSync(path, { force: true });
    deletedJobs++;

    const prefix = `${job.gameId}-`;
    for (const captureFile of readdirSync(CAPTURE_DIR)) {
      if (!captureFile.startsWith(prefix)) continue;
      rmSync(join(CAPTURE_DIR, captureFile), { force: true });
      deletedCaptures++;
    }
  }

  return { deletedJobs, deletedCaptures };
}

function getDueReason(job, nowMs) {
  if (job.state === "post") return null;
  if (nowMs > job.expiresAtMs) return null;

  if (force) return "forced";

  if (!job.firstScheduledAttemptAt && nowMs >= job.firstScrapeAtMs) {
    return "scheduled-24h";
  }

  if (!job.finalScheduledAttemptAt && nowMs >= job.finalScrapeAtMs) {
    return "scheduled-1h";
  }

  if (
    typeof job.retryAfterMs === "number" &&
    nowMs >= job.retryAfterMs &&
    nowMs < job.kickoffMs
  ) {
    const lastAttemptMs = job.lastAttemptAt ? new Date(job.lastAttemptAt).getTime() : 0;
    if (!lastAttemptMs || (nowMs - lastAttemptMs) >= refreshMs) {
      return "retry-no-data";
    }
  }

  return null;
}

function selectDueJobs(jobs, nowMs) {
  return jobs
    .map((job) => ({ job, reason: getDueReason(job, nowMs) }))
    .filter((entry) => entry.reason !== null);
}

function classifyResult(result) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();

  if (result.exitCode !== 0) {
    return { status: "failed", error: result.stderr || "worker capture failed" };
  }

  if (
    output.includes("no player prop legs found") ||
    output.includes("no stats available") ||
    output.includes("no odds available") ||
    output.includes("parser not yet implemented")
  ) {
    return { status: "no-data", error: null };
  }

  return { status: "captured", error: null };
}

async function runCapture(job) {
  const commandArgs = [
    "scripts/scrape-bet365-auto.py",
    "--gameId",     job.gameId,
    "--homeTeam",   job.homeTeam,
    "--awayTeam",   job.awayTeam,
    "--upload",     uploadBase,
    "--dumpDir",    CAPTURE_DIR,
    "--kickoffMs",  String(job.kickoffMs),
    "--expiresAtMs", String(job.expiresAtMs),
  ];

  if (headless) commandArgs.push("--headless");

  // Pass API keys from environment
  const env = {
    ...process.env,
    GEMINI_API_KEY:     process.env.GEMINI_API_KEY     ?? "",
    ODDS_UPLOAD_SECRET: process.env.ODDS_UPLOAD_SECRET ?? "",
  };

  if (dryRun) {
    console.log(`[dry-run] would run: python3 ${commandArgs.join(" ")}`);
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  return await execFileAsync("python3", commandArgs, {
    cwd: REPO_ROOT,
    env,
    maxBuffer: 20 * 1024 * 1024,
  }).then(
    ({ stdout, stderr }) => ({ exitCode: 0, stdout, stderr }),
    (err) => ({
      exitCode: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(err),
    }),
  );
}

async function main() {
  ensureDir(STATE_DIR);
  ensureDir(JOBS_DIR);
  ensureDir(CAPTURE_DIR);

  const nowMs = Date.now();
  const cleanup = cleanupExpiredState(nowMs);
  const games = await fetchUpcomingAFLGames();
  const filteredGames = targetGameId
    ? games.filter((game) => game.gameId === targetGameId)
    : games;
  const jobs = syncJobs(filteredGames);
  const dueJobs = selectDueJobs(jobs, nowMs);

  console.log(`[worker] games tracked: ${jobs.length}`);
  console.log(`[worker] due now: ${dueJobs.length}`);
  console.log(`[worker] cleanup: ${cleanup.deletedJobs} jobs, ${cleanup.deletedCaptures} captures removed`);
  if (targetGameId && jobs.length === 0) {
    console.warn(`[worker] target game not found on scoreboard: ${targetGameId}`);
  }

  for (const entry of dueJobs) {
    const { job, reason } = entry;
    console.log(
      `[worker] ${job.gameId} ${job.homeTeam} vs ${job.awayTeam} | ` +
      `kickoff ${job.kickoffISO} | active until ${formatISO(job.expiresAtMs)} | reason ${reason}`
    );

    const startedAt = new Date().toISOString();
    const jobBeforeRun = {
      ...job,
      lastAttemptAt: startedAt,
      updatedAt: startedAt,
      lastError: null,
    };
    saveJob(jobBeforeRun);

    const result = await runCapture(job);
    const finishedAt = new Date().toISOString();
    const classified = classifyResult(result);
    const finishedAtMs = new Date(finishedAt).getTime();
    const shouldRetry =
      classified.status === "no-data" &&
      (finishedAtMs + RETRY_AFTER_NO_DATA_MS) < job.kickoffMs;

    const jobAfterRun = {
      ...jobBeforeRun,
      lastCaptureAt: classified.status === "captured" ? finishedAt : job.lastCaptureAt,
      lastExitCode: result.exitCode,
      lastStatus: classified.status,
      firstScheduledAttemptAt:
        reason === "scheduled-24h" ? finishedAt : jobBeforeRun.firstScheduledAttemptAt,
      finalScheduledAttemptAt:
        reason === "scheduled-1h" ? finishedAt : jobBeforeRun.finalScheduledAttemptAt,
      retryAfterMs: shouldRetry ? finishedAtMs + RETRY_AFTER_NO_DATA_MS : null,
      lastError: classified.error,
      updatedAt: finishedAt,
    };

    saveJob(jobAfterRun);

    if (classified.status === "captured") {
      console.log(`[worker] ${job.gameId} capture completed`);
    } else if (classified.status === "no-data") {
      const retryMsg = shouldRetry
        ? ` retry scheduled for ${formatISO(jobAfterRun.retryAfterMs)}`
        : " no retry scheduled";
      console.log(`[worker] ${job.gameId} no data yet.${retryMsg}`);
    } else {
      console.warn(`[worker] ${job.gameId} capture failed: ${result.stderr}`);
    }
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
