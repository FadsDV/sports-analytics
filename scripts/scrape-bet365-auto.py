#!/usr/bin/env python3
"""
DegenHUB — Automated Bet365 AFL Player Props Scraper
=====================================================

Fully automated. Zero user input required.

Strategy:
  1. Launch stealth Chrome via selenium-driverless (bypasses Bet365 bot detection)
  2. Navigate to Bet365 AFL section, find the target game by team name
  3. Navigate to Player Disposals / Player Goals / Player Marks sections
  4. Screenshot each section (scrolling through the page)
  5. Send screenshots to Gemini Vision to extract player names, lines, odds
  6. POST to /api/odds/upload

Called by run-bet365-worker.mjs automatically before each AFL game.

Usage (direct):
  python3 scripts/scrape-bet365-auto.py \\
    --gameId afl-12345 \\
    --homeTeam "Port Adelaide" \\
    --awayTeam "Sydney Swans" \\
    --upload https://your-app.vercel.app

Env vars (or pass as flags):
  GEMINI_API_KEY      — Google Gemini API key (already used by betslip checker)
  ODDS_UPLOAD_SECRET  — Auth token for /api/odds/upload

Setup (one-time):
  pip install selenium-driverless --break-system-packages
"""

import argparse
import asyncio
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

try:
    from selenium_driverless import webdriver
    from selenium_driverless.types.by import By
except ImportError:
    print(
        "ERROR: selenium-driverless not installed.\n"
        "Run: pip install selenium-driverless --break-system-packages",
        file=sys.stderr,
    )
    sys.exit(1)

# ─── Constants ────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent

# Persistent Chrome profile — keeps Bet365 session between runs
PROFILE_DIR = SCRIPT_DIR / ".bet365-chrome-profile"

# Bet365 home — we navigate to AFL via sidebar click (URL-based navigation is fragile)
BET365_HOME_URL = "https://www.bet365.com.au/"

# Gemini API
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# Stat type mappings — Gemini → API code
STAT_MAP = {
    "disposal": "D",
    "disposals": "D",
    "goal": "G",
    "goals": "G",
    "mark": "M",
    "marks": "M",
    "tackle": "T",
    "tackles": "T",
    "kick": "K",
    "kicks": "K",
    "handball": "H",
    "handballs": "H",
    "hitout": "HO",
    "hitouts": "HO",
    "hit-out": "HO",
    "hit out": "HO",
    "hit outs": "HO",
}

# AFL team name → known Bet365 display variations (lowercase)
TEAM_ALIASES = {
    "port adelaide": ["port adelaide", "port power"],
    "sydney swans": ["sydney swans", "sydney", "swans"],
    "geelong cats": ["geelong cats", "geelong", "cats"],
    "carlton blues": ["carlton blues", "carlton", "blues"],
    "collingwood magpies": ["collingwood magpies", "collingwood", "magpies", "pies"],
    "richmond tigers": ["richmond tigers", "richmond tigers fc", "richmond", "tigers"],
    "hawthorn hawks": ["hawthorn hawks", "hawthorn", "hawks"],
    "essendon bombers": ["essendon bombers", "essendon", "bombers", "dons"],
    "western bulldogs": ["western bulldogs", "bulldogs", "dogs"],
    "west coast eagles": ["west coast eagles", "west coast", "eagles"],
    "fremantle dockers": ["fremantle dockers", "fremantle", "dockers"],
    "north melbourne kangaroos": ["north melbourne", "kangaroos", "roos", "north"],
    "brisbane lions": ["brisbane lions", "brisbane", "lions"],
    "adelaide crows": ["adelaide crows", "adelaide", "crows"],
    "melbourne demons": ["melbourne demons", "melbourne", "demons", "dees"],
    "greater western sydney giants": ["greater western sydney", "gws giants", "gws", "giants"],
    "gold coast suns": ["gold coast suns", "gold coast", "suns"],
    "st kilda saints": ["st kilda saints", "st kilda", "saints"],
}

# Player props sections to look for (in order of preference)
PROP_SECTION_LABELS = [
    "player disposals",
    "player goals",
    "player marks",
    "player tackles",
    "player props",
    "player statistics",
    "same game multi",
    "disposals",
    "goals",
    "marks",
]

# ─── Args ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Bet365 AFL odds scraper")
    p.add_argument("--gameId", required=True, help="e.g. afl-1133580")
    p.add_argument("--homeTeam", required=True, help="ESPN home team display name")
    p.add_argument("--awayTeam", required=True, help="ESPN away team display name")
    p.add_argument("--upload", required=True, help="Base URL of DegenHUB app")
    p.add_argument("--kickoffMs", type=int, default=None)
    p.add_argument("--expiresAtMs", type=int, default=None)
    p.add_argument("--geminiKey", default=os.environ.get("GEMINI_API_KEY", ""))
    p.add_argument("--oddsSecret", default=os.environ.get("ODDS_UPLOAD_SECRET", ""))
    p.add_argument("--dumpDir", default=None, help="Directory to save raw screenshot+JSON dumps")
    p.add_argument("--headless", action="store_true", help="Run Chrome headlessly")
    p.add_argument("--timeout", type=int, default=120, help="Max seconds to wait for Bet365 to load")
    return p.parse_args()

# ─── Gemini Vision ────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """
You are extracting AFL player prop betting odds from a Bet365 screenshot.

Find ALL player prop bets visible on screen. For each one extract:
- playerName: full player name as shown (e.g. "Zak Butters", "Jason Horne-Francis")
- statType: exactly one of: disposals, goals, marks, tackles, kicks, handballs, hitouts
- line: the numerical threshold as a float
  * "20+ disposals" → line: 20.0
  * "25+ disposals" → line: 25.0
  * "1+ goals" → line: 1.0
  * "2+ goals" → line: 2.0
  * "0.5" style lines → use as-is
- odds: the decimal odds as a float (e.g. 1.85, 2.10, 1.05)

Rules:
- Only include entries where player name AND odds are both clearly visible
- Do NOT include team totals, match result, line betting, or head-to-head
- Do NOT include "To Kick First Goal" or "Anytime Try Scorer" — only over/under style player props
- Do NOT guess or invent anything — if you can't read it clearly, skip it
- If the same player appears multiple times (e.g. 20+ and 25+ disposals), include each line separately

Return ONLY a valid JSON array, no explanation, no markdown:
[{"playerName": "...", "statType": "...", "line": 20.0, "odds": 1.85}]

If no player props are visible, return exactly: []
"""

GAME_FINDER_PROMPT = """
This is a screenshot of Bet365's AFL betting section.
I need to find a match between "{home}" and "{away}".

Look for text on screen that could be a clickable link to this game.
Return ONLY this JSON (no explanation):
{{"found": true, "clickText": "exact text visible on screen to identify this game"}}

If the game is not visible at all, return:
{{"found": false, "clickText": ""}}
"""


def call_gemini(api_key: str, image_b64: str, prompt: str) -> str:
    """Call Gemini Vision REST API. Returns raw text response."""
    url = f"{GEMINI_API_URL}?key={api_key}"
    body = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/png", "data": image_b64}},
            ]
        }],
        "generationConfig": {
            "temperature": 0.05,
            "maxOutputTokens": 4096,
        },
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read())
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini HTTP {e.code}: {body_text}") from e


def parse_json_from_text(text: str):
    """Extract first JSON array or object from a possibly-prose Gemini response."""
    text = text.strip()
    for bracket_open, bracket_close in [("[", "]"), ("{", "}")]:
        start = text.find(bracket_open)
        end = text.rfind(bracket_close)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass
    return None


def map_stat(stat_raw: str) -> str | None:
    """Convert a stat string from Gemini to the API stat code."""
    return STAT_MAP.get(stat_raw.lower().strip())


# ─── Browser helpers ──────────────────────────────────────────────────────────

async def screenshot_b64(driver) -> str:
    """Take a full-page screenshot and return as base64 PNG."""
    png_bytes = await driver.get_screenshot_as_png()
    return base64.b64encode(png_bytes).decode("utf-8")


async def save_screenshot(driver, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    png_bytes = await driver.get_screenshot_as_png()
    path.write_bytes(png_bytes)
    print(f"[scraper] Screenshot saved: {path}")


async def js_eval(driver, script: str):
    return await driver.execute_script(script)


async def find_element_by_partial_text(driver, text: str, timeout: float = 5):
    """Find any visible element containing text (case-insensitive)."""
    ltext = text.lower()
    xpath = f'//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "{ltext}")]'
    try:
        return await driver.find_element(By.XPATH, xpath, timeout=timeout)
    except Exception:
        return None


async def find_all_by_partial_text(driver, text: str, timeout: float = 5):
    ltext = text.lower()
    xpath = f'//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "{ltext}")]'
    try:
        return await driver.find_elements(By.XPATH, xpath, timeout=timeout)
    except Exception:
        return []


# ─── Navigation ───────────────────────────────────────────────────────────────

def get_team_aliases(team_name: str) -> list[str]:
    """Return all known aliases for a team name (including the name itself)."""
    key = team_name.lower().strip()
    for canonical, aliases in TEAM_ALIASES.items():
        if key == canonical or key in aliases:
            return aliases
    # Fallback: just the original and first word
    words = key.split()
    return [key] + ([words[0]] if words else [])


async def js_find_and_click_game(driver, home_aliases: list[str], away_aliases: list[str]) -> bool:
    """
    Use JavaScript to search the DOM for a game row containing both team names,
    then click the closest clickable ancestor. More reliable than XPath on obfuscated DOMs.
    """
    clicked = await driver.execute_script("""
        const homeAliases = arguments[0];
        const awayAliases = arguments[1];

        function textOf(el) {
            return (el.textContent || el.innerText || '').toLowerCase().trim();
        }

        // Find all leaf-ish elements (not too many children) containing a home alias
        const candidates = [];
        document.querySelectorAll('*').forEach(el => {
            if (el.children.length > 3) return;
            const t = textOf(el);
            for (const h of homeAliases) {
                if (t === h || t.includes(h)) {
                    candidates.push(el);
                    return;
                }
            }
        });

        // For each candidate, walk up to find a parent that also contains the away team
        for (const el of candidates) {
            let node = el;
            for (let i = 0; i < 8; i++) {
                node = node.parentElement;
                if (!node) break;
                const pt = textOf(node);
                const hasAway = awayAliases.some(a => pt.includes(a));
                if (hasAway) {
                    // Found container with both teams — click the first <a> or the node itself
                    const link = node.querySelector('a') || node;
                    link.click();
                    return true;
                }
            }
        }
        return false;
    """, home_aliases, away_aliases)
    return bool(clicked)


async def find_and_click_game(driver, home_team: str, away_team: str, api_key: str) -> bool:
    """
    Attempt to find and click the target game.
    Tries JS DOM search first (works on obfuscated Bet365 DOM), falls back to Gemini Vision.
    """
    home_aliases = get_team_aliases(home_team)
    away_aliases = get_team_aliases(away_team)

    # Strategy 1: JavaScript DOM search (faster and more reliable than XPath)
    found = await js_find_and_click_game(driver, home_aliases, away_aliases)
    if found:
        print(f"[scraper] Clicked game via JS DOM search")
        return True

    # Strategy 2: Gemini Vision — screenshot and ask Gemini where the game is
    print("[scraper] DOM match failed, trying Gemini Vision for game location...")
    try:
        img_b64 = await screenshot_b64(driver)
        prompt = GAME_FINDER_PROMPT.format(home=home_team, away=away_team)
        raw = call_gemini(api_key, img_b64, prompt)
        info = parse_json_from_text(raw)
        if info and info.get("found") and info.get("clickText"):
            click_text = info["clickText"]
            found = await js_find_and_click_game(driver, [click_text.lower()], away_aliases)
            if found:
                print(f"[scraper] Clicked game via Gemini suggestion: '{click_text}'")
                return True
    except Exception as e:
        print(f"[scraper] Gemini game-finder error: {e}", file=sys.stderr)

    return False


async def navigate_to_player_props(driver) -> bool:
    """
    After clicking a game, find and click into the player props section.
    Returns True if we found at least one props section.
    """
    found_any = False
    for label in PROP_SECTION_LABELS:
        el = await find_element_by_partial_text(driver, label, timeout=3)
        if el:
            try:
                await el.click()
                await asyncio.sleep(2)
                print(f"[scraper] Clicked props section: '{label}'")
                found_any = True
                break  # Navigate to first matching section
            except Exception:
                pass
    return found_any


# ─── Extraction ───────────────────────────────────────────────────────────────

async def extract_props_from_page(driver, api_key: str, dump_dir: Path | None, game_id: str) -> list[dict]:
    """
    Scroll through the current page taking screenshots, send each to Gemini,
    collect all unique player prop legs.
    """
    all_legs = []
    seen: set[str] = set()

    # Get total page height
    total_height = await js_eval(driver, "return document.body.scrollHeight") or 3000
    viewport_height = await js_eval(driver, "return window.innerHeight") or 800

    # Generate scroll positions (overlap each viewport by 20% to avoid missing items)
    scroll_step = int(viewport_height * 0.8)
    positions = list(range(0, int(total_height), scroll_step))
    if not positions or positions[-1] < total_height - viewport_height:
        positions.append(max(0, int(total_height) - int(viewport_height)))

    print(f"[scraper] Scrolling {len(positions)} positions (page height: {total_height}px)")

    for i, scroll_y in enumerate(positions):
        await js_eval(driver, f"window.scrollTo(0, {scroll_y})")
        await asyncio.sleep(1.5)

        img_b64 = await screenshot_b64(driver)

        # Save screenshot dump if requested
        if dump_dir:
            ts = int(time.time())
            await save_screenshot(driver, dump_dir / f"{game_id}-{ts}-scroll{i}.png")

        try:
            raw = call_gemini(api_key, img_b64, EXTRACTION_PROMPT)
            entries = parse_json_from_text(raw)

            if not isinstance(entries, list):
                continue

            for entry in entries:
                try:
                    stat_code = map_stat(entry.get("statType", ""))
                    if not stat_code:
                        continue
                    player = str(entry.get("playerName", "")).strip()
                    line = entry.get("line")
                    odds = entry.get("odds")

                    if not player:
                        continue
                    if not isinstance(line, (int, float)) or line <= 0:
                        continue
                    if not isinstance(odds, (int, float)) or odds < 1.0:
                        continue

                    dedup_key = f"{player.lower()}|{stat_code}|{line}"
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)

                    all_legs.append({
                        "player": player,
                        "stat": stat_code,
                        "line": float(line),
                        "price": float(odds),
                    })
                    print(f"[scraper]   + {player} {stat_code} {line}+ @ {odds}")

                except Exception as e:
                    print(f"[scraper] Entry parse error: {e} — {entry}", file=sys.stderr)

        except Exception as e:
            print(f"[scraper] Gemini error at scroll {i}: {e}", file=sys.stderr)

    return all_legs


async def scrape_all_prop_sections(driver, api_key: str, dump_dir: Path | None, game_id: str) -> list[dict]:
    """
    Iterate through all player prop section tabs/links and extract from each.
    Deduplication happens across sections.
    """
    all_legs = []
    seen: set[str] = set()

    # Collect all the prop section links visible on the page
    sections_clicked = []

    for label in PROP_SECTION_LABELS:
        elements = await find_all_by_partial_text(driver, label, timeout=3)
        for el in elements:
            try:
                el_text = (await el.text).strip().lower()
                if not el_text or el_text in sections_clicked:
                    continue
                if len(el_text) > 50:  # Skip large blocks of text
                    continue
                sections_clicked.append(el_text)

                await el.click()
                await asyncio.sleep(2.5)
                print(f"[scraper] Extracting from section: '{el_text}'")

                legs = await extract_props_from_page(driver, api_key, dump_dir, game_id)
                for leg in legs:
                    key = f"{leg['player'].lower()}|{leg['stat']}|{leg['line']}"
                    if key not in seen:
                        seen.add(key)
                        all_legs.append(leg)

                # Scroll back to top between sections
                await js_eval(driver, "window.scrollTo(0, 0)")
                await asyncio.sleep(1)
                break  # Found and clicked this section type, move to next

            except Exception as e:
                print(f"[scraper] Section click error for '{label}': {e}", file=sys.stderr)

    # If we found nothing via section navigation, try a full-page extraction
    if not all_legs:
        print("[scraper] No sections found, attempting full-page extraction...")
        all_legs = await extract_props_from_page(driver, api_key, dump_dir, game_id)

    return all_legs


# ─── Upload ───────────────────────────────────────────────────────────────────

def upload_odds(base_url: str, secret: str, payload: dict) -> bool:
    url = f"{base_url.rstrip('/')}/api/odds/upload"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read())
            return bool(result.get("ok"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[upload] HTTP {e.code}: {body}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[upload] error: {e}", file=sys.stderr)
        return False


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(args):
    if not args.geminiKey:
        print("ERROR: GEMINI_API_KEY not set (use --geminiKey or set env var)", file=sys.stderr)
        sys.exit(1)
    if not args.oddsSecret:
        print("ERROR: ODDS_UPLOAD_SECRET not set (use --oddsSecret or set env var)", file=sys.stderr)
        sys.exit(1)

    dump_dir = Path(args.dumpDir) if args.dumpDir else None

    print(f"[scraper] Game:    {args.homeTeam} vs {args.awayTeam}")
    print(f"[scraper] Game ID: {args.gameId}")
    print(f"[scraper] Upload:  {args.upload}")

    # Chrome options — persistent profile keeps session/cookies
    options = webdriver.ChromeOptions()
    options.add_argument(f"--user-data-dir={PROFILE_DIR}")
    options.add_argument("--window-size=1400,900")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    if args.headless:
        options.add_argument("--headless=new")

    async with webdriver.Chrome(options=options) as driver:
        # Navigate to Bet365 home
        print(f"[scraper] Opening Bet365...")
        await driver.get(BET365_HOME_URL)
        await asyncio.sleep(5)

        # Accept cookie banner if present
        for cookie_label in ["Accept All", "Accept Cookies", "Essential Only"]:
            el = await find_element_by_partial_text(driver, cookie_label, timeout=3)
            if el:
                try:
                    await el.click()
                    print(f"[scraper] Dismissed cookie banner ({cookie_label})")
                    await asyncio.sleep(2)
                    break
                except Exception:
                    pass

        # Use Selenium native find + click for AFL (same approach that worked for cookie banner)
        print(f"[scraper] Clicking AFL link (native Selenium)...")
        afl_clicked = False
        # Try exact text match first (sidebar "AFL"), then "Australian Rules" in A-Z
        for afl_xpath in [
            '//*[normalize-space(text())="AFL"]',
            '//*[normalize-space(text())="Australian Rules"]',
        ]:
            try:
                afl_el = await driver.find_element(By.XPATH, afl_xpath, timeout=5)
                await afl_el.click()
                print(f"[scraper] Clicked AFL via xpath: {afl_xpath}")
                afl_clicked = True
                await asyncio.sleep(6)
                break
            except Exception as e:
                print(f"[scraper] XPath {afl_xpath} failed: {e}", file=sys.stderr)

        if not afl_clicked:
            print("[scraper] All AFL click attempts failed", file=sys.stderr)

        # Save initial screenshot + page text for debugging
        if dump_dir:
            await save_screenshot(driver, dump_dir / f"{args.gameId}-00-afl-section.png")
            try:
                page_text = await driver.find_element(By.XPATH, "//body")
                body_text = await page_text.text
                txt_path = dump_dir / f"{args.gameId}-00-page-text.txt"
                txt_path.write_text(body_text[:5000])
                print(f"[scraper] Page text saved ({len(body_text)} chars): {txt_path}")
            except Exception as e:
                print(f"[scraper] Could not dump page text: {e}", file=sys.stderr)

        # Find and click the target game
        print(f"[scraper] Searching for game: {args.homeTeam} vs {args.awayTeam}")
        found = await find_and_click_game(driver, args.homeTeam, args.awayTeam, args.geminiKey)

        if not found:
            if dump_dir:
                await save_screenshot(driver, dump_dir / f"{args.gameId}-01-game-not-found.png")
            print("no player prop legs found — could not locate game on Bet365 AFL page", file=sys.stderr)
            sys.exit(1)

        await asyncio.sleep(4)

        if dump_dir:
            await save_screenshot(driver, dump_dir / f"{args.gameId}-02-game-page.png")

        # Extract player props from all sections
        legs = await scrape_all_prop_sections(driver, args.geminiKey, dump_dir, args.gameId)

    if not legs:
        print("no player prop legs found — Bet365 page may not have props available yet", file=sys.stderr)
        sys.exit(1)

    print(f"\n[scraper] Total legs extracted: {len(legs)}")

    # Save JSON dump
    if dump_dir:
        json_path = dump_dir / f"{args.gameId}-{int(time.time())}-legs.json"
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(legs, indent=2))
        print(f"[scraper] Legs saved: {json_path}")

    # Build upload payload
    payload: dict = {
        "gameId": args.gameId,
        "bookie": "bet365",
        "timestamp": int(time.time() * 1000),
        "legs": legs,
    }
    if args.kickoffMs:
        payload["kickoffAt"] = args.kickoffMs
    if args.expiresAtMs:
        payload["expiresAt"] = args.expiresAtMs

    # Upload
    print(f"[scraper] Uploading {len(legs)} legs to {args.upload}...")
    ok = upload_odds(args.upload, args.oddsSecret, payload)

    if ok:
        print(f"[scraper] Upload successful — {len(legs)} legs live")
    else:
        print("[scraper] Upload failed", file=sys.stderr)
        sys.exit(1)


def main():
    args = parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
