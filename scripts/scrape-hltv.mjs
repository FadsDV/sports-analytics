#!/usr/bin/env node
/**
 * HLTV scraper — run locally on mini PC.
 *
 * Opens ONE page: the HLTV match page you provide.
 * Extracts team ranks, map win rates, and H2H history from that single page.
 *
 * Usage:
 *   ODDS_UPLOAD_SECRET=dh-bet365-upload-2026 node scripts/scrape-hltv.mjs \
 *     --matchId cs2.match.12345 \
 *     --team1 "Vitality" \
 *     --team2 "MOUZ" \
 *     --hltvUrl "https://www.hltv.org/matches/2374000/vitality-vs-mouz-iem-cologne-2026" \
 *     --upload https://sports-analytics-plum.vercel.app
 *
 * --hltvUrl is required. Get it from your browser address bar on the HLTV match page.
 *
 * Flags:
 *   --dry-run     Print payload instead of uploading
 *   --debug       Dump page body text for selector debugging
 *   --headless    Run browser headlessly (default: false — visible window bypasses Cloudflare better)
 *
 * Setup (first time only):
 *   npx playwright install chromium
 *
 * Environment:
 *   ODDS_UPLOAD_SECRET   Required for upload
 */

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { HLTV } = require('hltv');

// ─── CLI args ─────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    matchId:   { type: 'string' },
    team1:     { type: 'string' },
    team2:     { type: 'string' },
    team1Id:   { type: 'string' },   // skip lookup: HLTV team ID
    team2Id:   { type: 'string' },   // skip lookup: HLTV team ID
    team1Rank: { type: 'string' },   // world rank e.g. 2
    team2Rank: { type: 'string' },   // world rank e.g. 5
    hltvUrl:   { type: 'string' },
    upload:    { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    debug:     { type: 'boolean', default: false },
    headless:  { type: 'boolean', default: false },
  },
  strict: false,
});

if (!args.matchId || !args.team1 || !args.team2) {
  console.error(
    'Usage: ODDS_UPLOAD_SECRET=... node scripts/scrape-hltv.mjs \\\n' +
    '  --matchId cs2.match.XYZ \\\n' +
    '  --team1 "Team Name" \\\n' +
    '  --team2 "Team Name" \\\n' +
    '  --hltvUrl "https://www.hltv.org/matches/..." \\\n' +
    '  [--upload https://your-app.vercel.app] [--dry-run]\n\n' +
    'Setup: npx playwright install chromium'
  );
  process.exit(1);
}

if (!args.hltvUrl) {
  console.error(
    '[hltv] --hltvUrl is required.\n' +
    '  Open the HLTV match page in your browser, copy the URL, and pass it with --hltvUrl.'
  );
  process.exit(1);
}

const DRY_RUN       = args['dry-run'];
const DEBUG         = args.debug;
const USE_HEADLESS  = args.headless ?? false;
const UPLOAD_SECRET = process.env.ODDS_UPLOAD_SECRET;

// ─── Constants ────────────────────────────────────────────────────────────────

const MAP_NAMES = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Overpass', 'Ancient', 'Anubis', 'Vertigo', 'Train', 'Cache'];

// ─── Browser helpers ──────────────────────────────────────────────────────────

async function openPage(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });
  return ctx.newPage();
}

async function loadPage(page, url) {
  console.log(`[hltv] → ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for JS-rendered content (Cloudflare challenge + dynamic data)
  try { await page.waitForSelector('table, .match-page, .stats-table, .g-grid', { timeout: 8000 }); } catch { /* ok */ }
  await page.waitForTimeout(4000);
}

// ─── Team lookup ──────────────────────────────────────────────────────────────

async function lookupTeam(name, knownId = null) {
  if (knownId) {
    console.log(`[hltv] Team "${name}" — using provided ID: ${knownId} (skipping lookup)`);
    return { id: parseInt(knownId), name, rank: null };
  }
  console.log(`[hltv] Looking up team: "${name}"...`);
  try {
    const team = await HLTV.getTeamByName({ name });
    console.log(`[hltv] Found: ${team.name} (ID: ${team.id}, Rank: #${team.rank ?? '?'})`);
    return { id: team.id, name: team.name, rank: team.rank ?? null };
  } catch (err) {
    console.warn(`[hltv] ⚠ lookupTeam failed for "${name}": ${err.message ?? err}`);
    console.warn(`[hltv]   Pass --team1Id / --team2Id to bypass lookup (IDs are in the HLTV URL)`);
    return null;
  }
}

// ─── Scrape match page (single page, all data) ───────────────────────────────

async function scrapeMatchPage(browser, hltvUrl, teamA, teamB) {
  const page = await openPage(browser);
  try {
    await loadPage(page, hltvUrl);

    const extracted = await page.evaluate(({ mapNames, tA, tB, tAId, tBId }) => {
      const body = document.body?.innerText ?? '';

      // ── Debug: page structure ──────────────────────────────────────────────
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
        .map(h => h.innerText?.trim()).filter(Boolean).slice(0, 20);

      // ── Map win rates ──────────────────────────────────────────────────────
      // HLTV match page has a "Maps" / "Map analysis" section showing:
      //   Map name | Team1 W% | Team2 W%
      // We extract by scanning all tables and text blocks for map names + percentages
      const homeMaps = [];
      const awayMaps = [];

      // Helper: given a row's text + extracted pct values, compute W/L.
      // The page shows "42% 12 maps" — pct integer appears in nums[], we skip it.
      // totalPlayed = first num NOT equal to any pct integer.
      function parseWL(rowText, pcts) {
        const pctInts = new Set(pcts.map(p => Math.round(p)));
        const nums = [...rowText.matchAll(/\b(\d+)\b/g)]
          .map(m => parseInt(m[1]))
          .filter(n => n > 0 && n < 500 && !pctInts.has(n));
        return nums; // [homeTotal, awayTotal, ...]
      }

      // Strategy 1: tables with map names in first column
      for (const table of document.querySelectorAll('table')) {
        const rows = Array.from(table.querySelectorAll('tr'));
        for (const tr of rows) {
          const cells = Array.from(tr.querySelectorAll('td, th'));
          if (cells.length < 2) continue;
          const firstCell = (cells[0].innerText ?? '').trim();
          const mapName = mapNames.find(m => firstCell === m || firstCell.includes(m));
          if (!mapName) continue;

          const rowText = tr.innerText ?? '';
          const pcts = [...rowText.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1]));
          if (pcts.length >= 2) {
            const counts = parseWL(rowText, pcts);
            const hTotal = counts[0] ?? 0, aTotal = counts[1] ?? 0;
            homeMaps.push({ mapName, winRate: pcts[0] / 100, wins: Math.round(pcts[0] / 100 * hTotal), losses: hTotal - Math.round(pcts[0] / 100 * hTotal), totalPlayed: hTotal });
            awayMaps.push({ mapName, winRate: pcts[1] / 100, wins: Math.round(pcts[1] / 100 * aTotal), losses: aTotal - Math.round(pcts[1] / 100 * aTotal), totalPlayed: aTotal });
          } else if (pcts.length === 1) {
            const counts = parseWL(rowText, pcts);
            const hTotal = counts[0] ?? 0;
            homeMaps.push({ mapName, winRate: pcts[0] / 100, wins: Math.round(pcts[0] / 100 * hTotal), losses: hTotal - Math.round(pcts[0] / 100 * hTotal), totalPlayed: hTotal });
          }
        }
        if (homeMaps.length >= 3) break;
      }

      // Strategy 2: text blocks — find map names followed by two % values on same/nearby lines
      if (homeMaps.length < 3) {
        const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
        for (const mapName of mapNames) {
          if (homeMaps.find(m => m.mapName === mapName)) continue;
          for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes(mapName)) continue;
            const block = lines.slice(i, i + 6).join(' ');
            const pcts = [...block.matchAll(/(\d+\.?\d*)\s*%/g)].map(m => parseFloat(m[1]));
            if (pcts.length >= 2 && pcts[0] > 0 && pcts[1] > 0) {
              const counts = parseWL(block, pcts);
              const hTotal = counts[0] ?? 0, aTotal = counts[1] ?? 0;
              homeMaps.push({ mapName, winRate: pcts[0] / 100, wins: Math.round(pcts[0] / 100 * hTotal), losses: hTotal - Math.round(pcts[0] / 100 * hTotal), totalPlayed: hTotal });
              awayMaps.push({ mapName, winRate: pcts[1] / 100, wins: Math.round(pcts[1] / 100 * aTotal), losses: aTotal - Math.round(pcts[1] / 100 * aTotal), totalPlayed: aTotal });
              break;
            } else if (pcts.length === 1 && pcts[0] > 0) {
              const counts = parseWL(block, pcts);
              const hTotal = counts[0] ?? 0;
              homeMaps.push({ mapName, winRate: pcts[0] / 100, wins: Math.round(pcts[0] / 100 * hTotal), losses: hTotal - Math.round(pcts[0] / 100 * hTotal), totalPlayed: hTotal });
              break;
            }
          }
        }
      }

      // ── H2H matches from match page ────────────────────────────────────────
      // HLTV match pages have a condensed H2H section showing last ~5-10 matches
      const h2hRows = [];
      const h2hContainers = Array.from(document.querySelectorAll('.result-con, .h2h-con, .wf-card'));

      for (const container of h2hContainers) {
        const text = (container.innerText ?? '').trim();
        if (!text) continue;
        const hasA = text.toLowerCase().includes(tA.toLowerCase().slice(0, 4));
        const hasB = text.toLowerCase().includes(tB.toLowerCase().slice(0, 4));
        if (!hasA && !hasB) continue;

        const scoreMatch = text.match(/(\d+)\s*[-:]\s*(\d+)/);
        if (!scoreMatch) continue;

        let date = null;
        const timeEl = container.querySelector('[data-unix]');
        if (timeEl) {
          const unix = parseInt(timeEl.getAttribute('data-unix') ?? '');
          if (!isNaN(unix)) date = new Date(unix).toISOString().slice(0, 10);
        }
        if (!date) {
          const shortDate = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i);
          if (shortDate) {
            const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
            const m = months[shortDate[2].slice(0, 3)];
            date = `${shortDate[3]}-${String(m).padStart(2,'0')}-${String(parseInt(shortDate[1])).padStart(2,'0')}`;
          }
        }

        let mapFound = null;
        for (const mn of mapNames) { if (text.includes(mn)) { mapFound = mn; break; } }

        h2hRows.push({ score1: parseInt(scoreMatch[1]), score2: parseInt(scoreMatch[2]), date, map: mapFound });
      }

      // ── Team ranks ─────────────────────────────────────────────────────────
      // Match page shows "#2 Vitality" or "Vitality #2" etc.
      const rankA = (() => {
        const m = body.match(new RegExp('#(\\d+)[^\\n]*' + tA)) ??
                  body.match(new RegExp(tA + '[^\\n]*#(\\d+)'));
        return m ? parseInt(m[1]) : null;
      })();
      const rankB = (() => {
        const m = body.match(new RegExp('#(\\d+)[^\\n]*' + tB)) ??
                  body.match(new RegExp(tB + '[^\\n]*#(\\d+)'));
        return m ? parseInt(m[1]) : null;
      })();

      return { homeMaps, awayMaps, h2hRows, headings, rankA, rankB, bodyPreview: body.slice(0, 5000) };
    }, { mapNames: MAP_NAMES, tA: teamA.name, tB: teamB.name, tAId: teamA.id, tBId: teamB.id });

    // Debug output
    if (DEBUG || extracted.homeMaps.length === 0) {
      console.log('\n[hltv] Page headings:', extracted.headings);
      console.log('[hltv] Body preview:\n' + extracted.bodyPreview.slice(0, 2000));
    }

    console.log(`[hltv] Match page: ${extracted.homeMaps.length} maps (home), ${extracted.awayMaps.length} maps (away), ${extracted.h2hRows.length} H2H entries`);
    return extracted;
  } finally {
    await page.close();
  }
}

// ─── Build H2H object ─────────────────────────────────────────────────────────

function buildH2H(h2hRows, teamAId, teamBId) {
  if (!h2hRows || h2hRows.length === 0) return null;

  // Deduplicate: skip if identical to previous row
  const deduped = [];
  for (const row of h2hRows) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.score1 === row.score1 && prev.score2 === row.score2 && prev.date === row.date) continue;
    deduped.push(row);
  }

  // Series-level scores (maps won: 0-3): use for win counting
  // Round-level scores (rounds won: 10+): supplementary
  const seriesRows = deduped.filter(r => Math.max(r.score1, r.score2) <= 5);
  const useForCount = seriesRows.length >= 3 ? seriesRows : deduped;

  let teamAWins = 0, teamBWins = 0;
  for (const r of useForCount) {
    if (r.score1 === r.score2) continue;
    if (r.score1 > r.score2) teamAWins++; else teamBWins++;
  }

  // Display: prefer series-level scores (maps won: 0–3 each side); fall back to all
  const displayRows = seriesRows.length >= 3 ? seriesRows : deduped;

  const entries = displayRows.slice(0, 20)
    .filter(r => r.score1 !== r.score2)
    .map((r, idx) => ({
      matchId:     `hltv.h2h.${idx}`,
      date:        r.date,
      tournament:  r.map ?? 'CS2',
      homeTeamId:  `hltv.${teamAId}`,
      awayTeamId:  `hltv.${teamBId}`,
      winnerId:    r.score1 > r.score2 ? `hltv.${teamAId}` : `hltv.${teamBId}`,
      seriesScore: { home: r.score1, away: r.score2 },
    }));

  console.log(`[hltv] H2H: ${deduped.length} unique (${seriesRows.length} series-level), ${teamAWins}-${teamBWins}`);

  return {
    teamAId:      `hltv.${teamAId}`,
    teamBId:      `hltv.${teamBId}`,
    teamAWins,
    teamBWins,
    total:        entries.length,
    teamAMapWins: teamAWins,
    teamBMapWins: teamBWins,
    entries,
  };
}

// ─── H2H fallback: dedicated results page ─────────────────────────────────────
// Used when the match page H2H section is empty.

async function fetchH2HFromResultsPage(browser, teamAId, teamBId, teamAName, teamBName) {
  const url = `https://www.hltv.org/results?team=${teamAId}&team=${teamBId}`;
  const page = await openPage(browser);
  try {
    await loadPage(page, url);

    const results = await page.evaluate(({ tA, tB }) => {
      let containers = Array.from(document.querySelectorAll('.result-con'));
      if (containers.length === 0) {
        containers = Array.from(document.querySelectorAll('.results-holder tr, tr'));
      }

      const mapNames = ['Dust2', 'Mirage', 'Inferno', 'Nuke', 'Overpass', 'Ancient', 'Anubis', 'Vertigo', 'Train', 'Cache'];
      const entries = [];

      for (const c of containers) {
        const text = (c.innerText ?? '').trim();
        if (!text) continue;
        const hasA = text.toLowerCase().includes(tA.toLowerCase().slice(0, 4));
        const hasB = text.toLowerCase().includes(tB.toLowerCase().slice(0, 4));
        if (!hasA && !hasB) continue;

        const scoreMatch = text.match(/(\d+)\s*[-:]\s*(\d+)/);
        if (!scoreMatch) continue;

        let date = null;
        const timeEl = c.querySelector('[data-unix]');
        if (timeEl) {
          const unix = parseInt(timeEl.getAttribute('data-unix') ?? '');
          if (!isNaN(unix)) date = new Date(unix).toISOString().slice(0, 10);
        }
        if (!date) {
          const shortDate = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})/i);
          if (shortDate) {
            const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
            const m = months[shortDate[2].slice(0, 3)];
            date = `${shortDate[3]}-${String(m).padStart(2,'0')}-${String(parseInt(shortDate[1])).padStart(2,'0')}`;
          }
        }

        let mapFound = null;
        for (const mn of mapNames) { if (text.includes(mn)) { mapFound = mn; break; } }

        entries.push({ score1: parseInt(scoreMatch[1]), score2: parseInt(scoreMatch[2]), date, map: mapFound });
      }
      return entries;
    }, { tA: teamAName, tB: teamBName });

    console.log(`[hltv] H2H results page: ${results.length} entries`);
    return results;
  } finally {
    await page.close();
  }
}

// ─── Convert map stats to our format ─────────────────────────────────────────

function toMapWinrates(rawMaps) {
  return rawMaps
    .filter(m => m.winRate > 0 && m.winRate <= 1)
    .map(m => ({
      mapName:         m.mapName,
      wins:            m.wins,
      losses:          m.losses,
      totalPlayed:     m.wins + m.losses,
      winRate:         m.winRate,
      avgScoreFor:     0,
      avgScoreAgainst: 0,
    }));
}

// ─── Upload ───────────────────────────────────────────────────────────────────

async function upload(uploadBase, payload) {
  if (!UPLOAD_SECRET) {
    console.error('[hltv] ODDS_UPLOAD_SECRET not set — cannot upload.');
    process.exit(1);
  }
  const url = `${uploadBase}/api/hltv/upload`;
  console.log(`\n[hltv] Uploading to ${url}...`);
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${UPLOAD_SECRET}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[hltv] Upload failed (${res.status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }
  try { console.log('[hltv] ✅ Uploaded:', JSON.parse(text)); }
  catch { console.log('[hltv] ✅ Uploaded:', text); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[hltv] Scraping ${args.team1} vs ${args.team2} (matchId: ${args.matchId})`);
  console.log(`[hltv] Match URL: ${args.hltvUrl}\n`);

  // 1. Look up team IDs (fast, works without Playwright)
  //    Pass --team1Id / --team2Id to bypass if HLTV is rate-limiting
  const [teamA, teamB] = await Promise.all([
    lookupTeam(args.team1, args.team1Id),
    lookupTeam(args.team2, args.team2Id),
  ]);

  if (!teamA || !teamB) {
    console.error('[hltv] One or both teams not found. Use --team1Id / --team2Id to bypass lookup.');
    process.exit(1);
  }

  // 2. Launch browser (visible window = better Cloudflare bypass)
  console.log(`\n[hltv] Launching browser (headless: ${USE_HEADLESS})...`);
  const browser = await chromium.launch({ headless: USE_HEADLESS });

  let homeMaps = [], awayMaps = [], h2hRows = [];

  try {
    // 3. Scrape the match page — ONE page, all data
    const matchData = await scrapeMatchPage(browser, args.hltvUrl, teamA, teamB);
    homeMaps  = matchData.homeMaps;
    awayMaps  = matchData.awayMaps;
    h2hRows   = matchData.h2hRows;
    // Rank: CLI arg > page-extracted > lookup
    if (args.team1Rank) teamA.rank = parseInt(args.team1Rank);
    else if (matchData.rankA && !teamA.rank) teamA.rank = matchData.rankA;
    if (args.team2Rank) teamB.rank = parseInt(args.team2Rank);
    else if (matchData.rankB && !teamB.rank) teamB.rank = matchData.rankB;

    // 4. If match page had no H2H, fall back to results page
    if (h2hRows.length === 0) {
      console.log('[hltv] No H2H on match page — fetching from results page...');
      h2hRows = await fetchH2HFromResultsPage(browser, teamA.id, teamB.id, teamA.name, teamB.name);
    }
  } finally {
    await browser.close();
  }

  const h2h = buildH2H(h2hRows, teamA.id, teamB.id);

  const payload = {
    matchId:    args.matchId,
    uploadedAt: Date.now(),
    homeTeam:   { hltvId: teamA.id, name: teamA.name, rank: teamA.rank, mapStats: toMapWinrates(homeMaps) },
    awayTeam:   { hltvId: teamB.id, name: teamB.name, rank: teamB.rank, mapStats: toMapWinrates(awayMaps) },
    h2h,
  };

  // Summary
  console.log(`\n[hltv] Summary:`);
  console.log(`  ${teamA.name} (#${teamA.rank ?? '?'}): ${payload.homeTeam.mapStats.length} maps`);
  if (payload.homeTeam.mapStats.length) console.log(`    ${payload.homeTeam.mapStats.slice(0,4).map(m => `${m.mapName} ${Math.round(m.winRate*100)}%`).join(', ')}`);
  console.log(`  ${teamB.name} (#${teamB.rank ?? '?'}): ${payload.awayTeam.mapStats.length} maps`);
  if (payload.awayTeam.mapStats.length) console.log(`    ${payload.awayTeam.mapStats.slice(0,4).map(m => `${m.mapName} ${Math.round(m.winRate*100)}%`).join(', ')}`);
  console.log(`  H2H: ${h2h?.teamAWins ?? 0}–${h2h?.teamBWins ?? 0} (${h2h?.total ?? 0} entries)`);

  if (DRY_RUN || !args.upload) {
    console.log('\n[hltv] --dry-run: printing payload (not uploading)');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await upload(args.upload, payload);
}

main().catch(err => {
  console.error('[hltv] Fatal:', err);
  process.exit(1);
});
