#!/usr/bin/env node
/**
 * DegenHUB — Bet365 AFL Odds Scraper
 *
 * Runs on your home PC using your existing Chrome profile (no login required).
 * Intercepts ALL Bet365 internal API responses for an AFL game and either:
 *   --trial  : dumps raw JSON for inspection
 *   --upload : captures a game-specific raw dump and, once the parser is ready,
 *              parses + POSTs real odds to /api/odds/upload
 *
 * Usage:
 *   # Phase 1 — capture everything, inspect the raw API shape
 *   node scripts/scrape-bet365.mjs --trial
 *
 *   # Phase 2 — upload parsed player props to local dev server
 *   node scripts/scrape-bet365.mjs --gameId afl-1133580 --upload http://localhost:3000
 *
 *   # Phase 2 — upload to production Vercel
 *   node scripts/scrape-bet365.mjs --gameId afl-1133580 --upload https://your-app.vercel.app
 *
 * Setup (one-time):
 *   npx playwright install chromium   ← downloads Playwright's bundled Chromium (~200MB)
 *   First run: log into Bet365 in the window that opens. Session is saved for future runs.
 *
 * Environment:
 *   ODDS_UPLOAD_SECRET   Required for --upload mode (set in shell or .env.local)
 *
 * NO FAKE DATA — this script only posts real prices from Bet365 network responses.
 * If no matching data is found, the raw capture is kept locally for parser work.
 */

import { chromium }                          from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join }                     from "path";
import { fileURLToPath }                     from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// CONFIG — edit BET365_AFL_URL if the URL changes, rest is auto
// ---------------------------------------------------------------------------

// Local profile dir — saves your Bet365 session between runs (gitignored)
const PROFILE_DIR     = join(__dirname, ".bet365-profile-ff");
const BET365_HOME_URL = "https://www.bet365.com.au/";
const BET365_AFL_URL  = "https://www.bet365.com.au/#/AC/B152/C1/D50/E2/";
const DEFAULT_CAPTURE_DIR = join(REPO_ROOT, "data", "local", "bet365-captures");
const INTERESTING_URL_PARTS = [
  "playercontentapi",
  "matchmarketscontentapi",
  "specialeventcontentapi",
  "matchbettingcontentapi",
  "oddsoncouponcontentapi",
  "market",
  "player",
  "coupon",
];

// WS hosts we always log frames for (so we can see actual odds data in terminal)
const INTERESTING_WS_HOSTS = [
  "premws",
  "pshudws",
  "365lpodds",
];

/**
 * How long to wait (seconds) for you to navigate the game page.
 *
 * During --trial: navigate through ALL market tabs:
 *   1. Click into an AFL game
 *   2. Match Result tab — wait for prices to load
 *   3. Player Props tab — scroll through all players
 *   4. SGM Builder — open a few player cards
 *
 * 90 seconds should be enough. Increase if you need more time.
 */
const WAIT_SECONDS = 240; // 4 minutes — time to navigate to a game's player props

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args    = process.argv.slice(2);
const isTrial    = args.includes("--trial");
const gameIdIdx  = args.indexOf("--gameId");
const gameId     = gameIdIdx !== -1 ? args[gameIdIdx + 1] ?? null : null;
const uploadIdx  = args.indexOf("--upload");
const uploadBase = uploadIdx !== -1 ? args[uploadIdx + 1] ?? null : null;
const isUpload   = !!uploadBase;
const dumpDirIdx = args.indexOf("--dumpDir");
const dumpDir    = dumpDirIdx !== -1 ? args[dumpDirIdx + 1] ?? null : DEFAULT_CAPTURE_DIR;
const kickoffIdx = args.indexOf("--kickoffMs");
const kickoffAt  = kickoffIdx !== -1 ? Number(args[kickoffIdx + 1] ?? "") : undefined;
const expiresIdx = args.indexOf("--expiresAtMs");
const expiresAt  = expiresIdx !== -1 ? Number(args[expiresIdx + 1] ?? "") : undefined;
const headless   = args.includes("--headless");
const verbose    = args.includes("--verbose");

if (!isTrial && !isUpload) {
  console.error("Usage:");
  console.error("  node scripts/scrape-bet365.mjs --trial");
  console.error("  node scripts/scrape-bet365.mjs --gameId afl-XXXXX --upload http://localhost:3000");
  process.exit(1);
}

if (isUpload && !gameId) {
  console.error("Error: --gameId is required when using --upload");
  process.exit(1);
}

if (kickoffAt != null && !Number.isFinite(kickoffAt)) {
  console.error("Error: --kickoffMs must be a unix timestamp in milliseconds");
  process.exit(1);
}

if (expiresAt != null && !Number.isFinite(expiresAt)) {
  console.error("Error: --expiresAtMs must be a unix timestamp in milliseconds");
  process.exit(1);
}

const UPLOAD_SECRET = process.env.ODDS_UPLOAD_SECRET;
if (isUpload && !UPLOAD_SECRET) {
  console.error("Error: ODDS_UPLOAD_SECRET env var is required for upload mode");
  console.error("  export ODDS_UPLOAD_SECRET=your-secret");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Launch browser — Playwright's bundled Chromium with a local saved session
// ---------------------------------------------------------------------------
if (!existsSync(PROFILE_DIR)) {
  mkdirSync(PROFILE_DIR, { recursive: true });
  console.log("First run — a new browser profile will be created.");
  console.log("Log into Bet365 in the window that opens. Your session will be saved.\n");
}

const PROFILE_DIR_CHROMIUM = PROFILE_DIR.replace("-ff", "-chromium");

console.log("Launching Chromium...");
console.log(`Session profile: ${PROFILE_DIR_CHROMIUM}`);

const browser = await chromium.launchPersistentContext(PROFILE_DIR_CHROMIUM, {
  headless,
  viewport:          null,
  ignoreHTTPSErrors: false,
  args: [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--disable-extensions-except=",
  ],
});

const page = await browser.newPage();

// Hide automation signals so Bet365 doesn't detect Playwright
await page.addInitScript(() => {
  try { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); } catch {}
  try { delete navigator.__proto__.webdriver; } catch {}
});

await page.addInitScript(() => {
  const OriginalWebSocket = window.WebSocket;
  const tap = {
    installedAt: Date.now(),
    sockets: [],
  };

  const normalizePayload = async (payload) => {
    try {
      if (typeof payload === "string") return payload;
      if (payload instanceof ArrayBuffer) {
        return new TextDecoder().decode(payload);
      }
      if (ArrayBuffer.isView(payload)) {
        return new TextDecoder().decode(payload);
      }
      if (payload instanceof Blob) {
        return await payload.text();
      }
      return String(payload);
    } catch (error) {
      return `[payload decode failed: ${String(error)}]`;
    }
  };

  const recordEvent = async (entry, direction, payload) => {
    const text = await normalizePayload(payload);
    entry.events.push({
      ts: Date.now(),
      direction,
      payload: text.length > 50000
        ? `${text.slice(0, 50000)}\n...[truncated ${text.length - 50000} chars]`
        : text,
    });
  };

  function WrappedWebSocket(...args) {
    const ws = new OriginalWebSocket(...args);
    const entry = {
      url: String(args[0] ?? ""),
      createdAt: Date.now(),
      events: [],
      closedAt: null,
    };
    tap.sockets.push(entry);

    const originalSend = ws.send.bind(ws);
    ws.send = function patchedSend(data) {
      void recordEvent(entry, "sent", data);
      return originalSend(data);
    };

    ws.addEventListener("message", (event) => {
      void recordEvent(entry, "received", event.data);
    });

    ws.addEventListener("close", () => {
      entry.closedAt = Date.now();
    });

    ws.addEventListener("error", () => {
      entry.errorAt = Date.now();
    });

    return ws;
  }

  WrappedWebSocket.prototype = OriginalWebSocket.prototype;
  Object.setPrototypeOf(WrappedWebSocket, OriginalWebSocket);
  window.WebSocket = WrappedWebSocket;
  window.__b365WsTap = tap;
});

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function buildCapturePayload() {
  return {
    capturedAt:     new Date().toISOString(),
    gameId,
    kickoffAt,
    expiresAt,
    totalResponses: captures.length,
    seenUrls,
    webSockets,
    pageWebSockets,
    captures,
  };
}

function writeCaptureDump() {
  ensureDir(dumpDir);

  if (isTrial) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const outPath = join(dumpDir, `bet365-trial-${dateStr}.json`);
    writeFileSync(outPath, JSON.stringify({
      ...buildCapturePayload(),
      urlPatterns: Object.keys(groupCapturesByUrl()),
      captures:    groupCapturesByUrl(),
    }, null, 2));
    return outPath;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeGameId = gameId?.replace(/[^a-z0-9-]/gi, "_") ?? "unknown-game";
  const outPath = join(dumpDir, `${safeGameId}-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(buildCapturePayload(), null, 2));
  return outPath;
}

function groupCapturesByUrl() {
  const byUrl = {};
  for (const c of captures) {
    let key;
    try {
      key = new URL(c.url).pathname.split("/").slice(0, 5).join("/") || c.url;
    } catch {
      key = c.url.slice(0, 80);
    }
    if (!byUrl[key]) byUrl[key] = [];
    byUrl[key].push(c);
  }
  return byUrl;
}

// ---------------------------------------------------------------------------
// Network interception — capture ALL JSON responses from Bet365 domains
// ---------------------------------------------------------------------------
const captures = [];
const seenUrls = [];
const webSockets = [];
let pageWebSockets = [];

function isInterestingUrl(url) {
  const lower = url.toLowerCase();
  return INTERESTING_URL_PARTS.some(part => lower.includes(part));
}

function trimText(text, maxChars = 200_000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function trimFramePayload(payload, maxChars = 50_000) {
  if (payload.length <= maxChars) return payload;
  return `${payload.slice(0, maxChars)}\n...[truncated ${payload.length - maxChars} chars]`;
}

page.on("websocket", (ws) => {
  const url = ws.url();
  const entry = {
    url,
    openedAt: Date.now(),
    framesSent: [],
    framesReceived: [],
    closedAt: null,
    error: null,
  };

  webSockets.push(entry);

  console.log(`[websocket] open ${url}`);

  ws.on("framesent", (event) => {
    const payload = typeof event.payload === "string"
      ? event.payload
      : Buffer.from(event.payload).toString("utf8");
    entry.framesSent.push({
      ts: Date.now(),
      payload: trimFramePayload(payload),
    });
    if (verbose || isInterestingUrl(url) || INTERESTING_WS_HOSTS.some(h => url.includes(h))) {
      console.log(`[ws:sent] ${trimFramePayload(payload, 400)}`);
    }
  });

  ws.on("framereceived", (event) => {
    const payload = typeof event.payload === "string"
      ? event.payload
      : Buffer.from(event.payload).toString("utf8");
    entry.framesReceived.push({
      ts: Date.now(),
      payload: trimFramePayload(payload),
    });
    if (verbose || isInterestingUrl(url) || INTERESTING_WS_HOSTS.some(h => url.includes(h))) {
      console.log(`[ws:recv] ${trimFramePayload(payload, 600)}`);
    }
  });

  ws.on("close", () => {
    entry.closedAt = Date.now();
    console.log(`[websocket] close ${url}`);
  });

  ws.on("socketerror", (error) => {
    entry.error = String(error);
    console.warn(`[websocket] error ${url}: ${entry.error}`);
  });
});

page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes("bet365")) return;

  // Skip static assets and analytics
  if (url.match(/\.(js|css|png|jpg|gif|ico|woff|svg)(\?|$)/)) return;
  if (url.includes("analytics") || url.includes("tracking") || url.includes("gtm")) return;

  const headers = res.headers();
  const ct = headers["content-type"] ?? "";
  const interesting = isInterestingUrl(url);

  if (verbose || interesting) {
    seenUrls.push({ url, status: res.status(), contentType: ct });
    console.log(`[capture] ${res.status()} ${ct || "unknown"} ${url}`);
  }

  try {
    let body = null;
    let rawText = null;
    let format = "unknown";

    try {
      body = await res.json();
      format = "json";
    } catch {
      try {
        rawText = await res.text();
        format = "text";
      } catch {
        rawText = null;
      }
    }

    if (!interesting && format !== "json" && !ct.includes("json") && !ct.includes("javascript")) {
      return;
    }

    captures.push({
      url,
      status: res.status(),
      ts: Date.now(),
      contentType: ct,
      format,
      headers,
      body,
      rawText: typeof rawText === "string" ? trimText(rawText) : null,
    });
  } catch {
    // Some Bet365 responses are opaque / consumed by the page before we can parse them.
  }
});

// ---------------------------------------------------------------------------
// Navigate and wait
// ---------------------------------------------------------------------------
let browserClosed = false;
browser.on("close", () => { browserClosed = true; });

console.log("\nNavigating to Bet365...");
try {
  // Home page first to initialise the app session
  await page.goto(BET365_AFL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3_000);
} catch {
  // navigation errors are non-fatal — continue with capture window
}

if (isTrial) {
  console.log("\n" + "=".repeat(60));
  console.log("TRIAL MODE — AFL section loaded. You have 4 minutes.");
  console.log("");
  console.log("  1. Find Port Adelaide vs Sydney Swans in the game list");
  console.log("  2. Click into the game");
  console.log("  3. Click 'Player Props' or 'Same Game Multi' tab");
  console.log("  4. Scroll through all player markets so they load");
  console.log("  5. DO NOT close the browser — it saves and closes itself");
  console.log("=".repeat(60));
  console.log(`\nCapturing for ${WAIT_SECONDS} seconds...\n`);
} else {
  console.log("\n" + "=".repeat(60));
  console.log("UPLOAD MODE — Navigate to the target AFL game markets.");
  console.log("  Open Player Props and/or SGM Builder. DO NOT close the browser.");
  console.log("=".repeat(60));
  console.log(`\nCapturing for ${WAIT_SECONDS} seconds...\n`);
}

// Wait in small chunks so we can exit cleanly if the browser is closed
const chunkMs = 2_000;
const totalChunks = Math.ceil((WAIT_SECONDS * 1_000) / chunkMs);
for (let i = 0; i < totalChunks; i++) {
  if (browserClosed) {
    console.log("\nBrowser was closed — saving captures early.");
    break;
  }
  const remaining = WAIT_SECONDS - Math.floor((i * chunkMs) / 1_000);
  if (remaining % 15 === 0 && remaining > 0) {
    process.stdout.write(`\r  ${remaining}s remaining...`);
  }
  try {
    await page.waitForTimeout(chunkMs);
  } catch {
    browserClosed = true;
    break;
  }
}
console.log("");

try {
  pageWebSockets = await page.evaluate(() => {
    const tap = window.__b365WsTap;
    if (!tap || !Array.isArray(tap.sockets)) return [];
    return tap.sockets;
  });
} catch {
  pageWebSockets = [];
}

console.log(`\nCapture window closed. Intercepted ${captures.length} responses.`);

// ---------------------------------------------------------------------------
// TRIAL MODE — dump raw captures grouped by URL pattern
// ---------------------------------------------------------------------------
if (isTrial) {
  const byUrl = groupCapturesByUrl();
  const outPath = writeCaptureDump();

  console.log("\n" + "=".repeat(60));
  console.log(`Saved ${captures.length} responses → ${outPath}`);
  console.log("\nURL patterns captured:");
  for (const url of Object.keys(byUrl)) {
    console.log(`  [${byUrl[url].length}x]  ${url}`);
  }
  console.log("\nNext step:");
  console.log("  Open the trial JSON and find the response(s) containing:");
  console.log("  - Match H2H / handicap / total prices");
  console.log("  - Player names + disposal/goal/mark lines + prices");
  console.log("  Note the URL pattern and JSON key path, then write the parser below.");
  console.log("=".repeat(60));

  try { await browser.close(); } catch {}
  process.exit(0);
}

// ---------------------------------------------------------------------------
// UPLOAD MODE (Phase 2) — parse captured responses and upload
// ---------------------------------------------------------------------------
//
// TODO: Fill in the parser below once the trial has revealed the response shape.
//
// The trial JSON shows which URL pattern(s) contain market data. Common shapes seen
// in Bet365 API responses (may vary — always verify from your trial output first):
//
//   Pattern A — array of events/markets at top level:
//     body[].ma[]    → markets, each with .mn (market name) and .pa[] (participants)
//     participant:   { na: "Player Name", od: "1.85" }
//
//   Pattern B — nested fixture object:
//     body.fi.ma[]   → markets
//     body.fi.ma[].ev[].ha[].od  → odds decimal string
//
// Identify the actual shape from your trial file, then implement:
//
//   function parsePlayerProps(captures) → Array<{ player, stat, line, price }>
//   function parseMatchMarkets(captures) → Array<{ type, period, selection, line, price }>
//
// ---------------------------------------------------------------------------

console.log("\nUpload mode parser not yet implemented.");
console.log("Run --trial first to inspect the Bet365 API response shape.");
console.log("Then implement the parser in scripts/scrape-bet365.mjs (see TODO above).");
const rawCapturePath = writeCaptureDump();
console.log(`Raw capture saved → ${rawCapturePath}`);
console.log("No stats available yet for upload.");

// Example of what the upload call will look like once the parser is written:
//
// const legs = parsePlayerProps(captures);
// if (legs.length === 0) {
//   console.log("No player prop legs found — nothing to upload.");
// } else {
//   const res = await fetch(`${uploadBase}/api/odds/upload`, {
//     method:  "POST",
//     headers: {
//       "Content-Type":  "application/json",
//       "Authorization": `Bearer ${UPLOAD_SECRET}`,
//     },
//     body: JSON.stringify({
//       gameId,
//       bookie:    "bet365",
//       timestamp: Date.now(),
//       legs,
//     }),
//   });
//   const data = await res.json();
//   console.log(`Uploaded ${data.saved} legs → ${uploadBase}/api/odds/upload`);
// }

try { await browser.close(); } catch {}
process.exit(0);
