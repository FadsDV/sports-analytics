#!/usr/bin/env python3
"""
DegenHUB — Bet365 Connect-Mode Extractor
=========================================

Connects to a Chrome browser you've already navigated to the right page.
No automation, no detection risk — you drive, the script extracts.

Workflow:
  1. Start Chrome:   bash scripts/start-bet365-chrome.sh
  2. Navigate to:    AFL → [Game] → Player Disposals / Player Goals / Player Marks tabs
  3. Run this script when the props are visible on screen

Usage:
  python3 scripts/bet365-connect.py \\
    --gameId afl-12345 \\
    --homeTeam "Richmond Tigers" \\
    --awayTeam "Brisbane Lions" \\
    --upload https://sports-analytics-plum.vercel.app

The script will:
  - Screenshot what Chrome currently shows
  - Send to Gemini Vision to extract player props
  - Upload to /api/odds/upload
  - Repeat for each prop section you navigate to (asks you to confirm between sections)

Env vars:
  GEMINI_API_KEY      — Google Gemini API key
  ODDS_UPLOAD_SECRET  — Auth token for /api/odds/upload
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

CHROME_DEBUG_PORT = 9222
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

STAT_MAP = {
    "disposal": "D", "disposals": "D",
    "goal": "G", "goals": "G",
    "mark": "M", "marks": "M",
    "tackle": "T", "tackles": "T",
    "kick": "K", "kicks": "K",
    "handball": "H", "handballs": "H",
    "hitout": "HO", "hitouts": "HO", "hit-out": "HO", "hit out": "HO", "hit outs": "HO",
}

EXTRACTION_PROMPT = """
You are extracting AFL player prop betting odds from a Bet365 screenshot.

Find ALL player prop bets visible on screen. For each one extract:
- playerName: full player name as shown (e.g. "Zak Butters", "Jason Horne-Francis")
- statType: exactly one of: disposals, goals, marks, tackles, kicks, handballs, hitouts
- line: the numerical threshold as a float
  * "20+ disposals" → line: 20.0
  * "1+ goals" → line: 1.0
- odds: the decimal odds as a float (e.g. 1.85, 2.10, 1.05)

Rules:
- Only include entries where player name AND odds are both clearly visible
- Do NOT include match result, line betting, head-to-head, or "First Goalscorer" style markets
- Do NOT guess or invent anything — if unclear, skip it
- If the same player appears multiple times with different lines, include each separately

Return ONLY a valid JSON array, no explanation, no markdown:
[{"playerName": "...", "statType": "...", "line": 20.0, "odds": 1.85}]

If no player props are visible, return exactly: []
"""


# ─── Chrome CDP helpers ───────────────────────────────────────────────────────

def get_tabs(port: int = CHROME_DEBUG_PORT) -> list[dict]:
    """Fetch list of open Chrome tabs via DevTools Protocol."""
    try:
        req = urllib.request.Request(f"http://localhost:{port}/json")
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())
    except Exception as e:
        raise RuntimeError(
            f"Could not connect to Chrome on port {port}.\n"
            f"Make sure Chrome is running: bash scripts/start-bet365-chrome.sh\n"
            f"Error: {e}"
        )


def get_bet365_tab(port: int = CHROME_DEBUG_PORT) -> dict:
    """Find the active Bet365 tab."""
    tabs = get_tabs(port)
    # Prefer Bet365 tab
    for tab in tabs:
        if "bet365" in tab.get("url", "").lower() and tab.get("type") == "page":
            return tab
    # Fall back to any page tab
    for tab in tabs:
        if tab.get("type") == "page":
            return tab
    raise RuntimeError("No page tabs found in Chrome. Navigate to Bet365 first.")


async def screenshot_via_cdp(ws_url: str) -> str:
    """Take a screenshot of the current Chrome tab via CDP WebSocket."""
    try:
        import websockets
    except ImportError:
        raise RuntimeError(
            "websockets package not installed.\n"
            "Run: pip install websockets --break-system-packages"
        )

    async with websockets.connect(ws_url, max_size=50_000_000) as ws:
        cmd = json.dumps({
            "id": 1,
            "method": "Page.captureScreenshot",
            "params": {"format": "png", "quality": 95, "captureBeyondViewport": False}
        })
        await ws.send(cmd)
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if msg.get("id") == 1:
                if "error" in msg:
                    raise RuntimeError(f"CDP screenshot error: {msg['error']}")
                return msg["result"]["data"]


async def scroll_and_screenshot_cdp(ws_url: str, scroll_y: int) -> str:
    """Scroll to position and take screenshot."""
    try:
        import websockets
    except ImportError:
        raise RuntimeError("websockets not installed")

    async with websockets.connect(ws_url, max_size=50_000_000) as ws:
        # Scroll
        scroll_cmd = json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": f"window.scrollTo(0, {scroll_y})"}
        })
        await ws.send(scroll_cmd)
        await asyncio.sleep(1.5)

        # Screenshot
        shot_cmd = json.dumps({
            "id": 2,
            "method": "Page.captureScreenshot",
            "params": {"format": "png", "quality": 95}
        })
        await ws.send(shot_cmd)
        while True:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            if msg.get("id") == 2:
                return msg["result"]["data"]


# ─── Gemini Vision ────────────────────────────────────────────────────────────

def call_gemini(api_key: str, image_b64: str, prompt: str) -> str:
    url = f"{GEMINI_API_URL}?key={api_key}"
    body = {
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/png", "data": image_b64}},
        ]}],
        "generationConfig": {"temperature": 0.05, "maxOutputTokens": 4096},
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read())
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Gemini HTTP {e.code}: {e.read().decode()}") from e


def parse_gemini_json(text: str) -> list:
    text = text.strip()
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return []


def map_stat(stat_raw: str) -> str | None:
    return STAT_MAP.get(stat_raw.lower().strip())


# ─── Upload ───────────────────────────────────────────────────────────────────

def upload_odds(base_url: str, secret: str, payload: dict) -> bool:
    url = f"{base_url.rstrip('/')}/api/odds/upload"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {secret}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read())
            return bool(result.get("ok"))
    except urllib.error.HTTPError as e:
        print(f"[upload] HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[upload] error: {e}", file=sys.stderr)
        return False


# ─── Main extraction ──────────────────────────────────────────────────────────

async def extract_from_current_page(ws_url: str, api_key: str, dump_dir: Path | None, game_id: str) -> list[dict]:
    """Screenshot current page, scroll through it, extract all props via Gemini."""
    all_legs = []
    seen: set[str] = set()

    # Take initial screenshot to get page dimensions
    print("[extract] Taking screenshots...")

    # We'll scroll through 5 viewport-heights worth of content
    scroll_positions = [0, 700, 1400, 2100, 2800]

    for i, scroll_y in enumerate(scroll_positions):
        try:
            img_b64 = await scroll_and_screenshot_cdp(ws_url, scroll_y)
        except Exception as e:
            print(f"[extract] Screenshot error at scroll {i}: {e}", file=sys.stderr)
            continue

        if dump_dir:
            ts = int(time.time())
            png_path = dump_dir / f"{game_id}-extract-{ts}-{i}.png"
            png_path.parent.mkdir(parents=True, exist_ok=True)
            png_path.write_bytes(base64.b64decode(img_b64))
            print(f"[extract] Screenshot: {png_path.name}")

        try:
            raw = call_gemini(api_key, img_b64, EXTRACTION_PROMPT)
            entries = parse_gemini_json(raw)

            for entry in entries:
                stat_code = map_stat(entry.get("statType", ""))
                if not stat_code:
                    continue
                player = str(entry.get("playerName", "")).strip()
                line = entry.get("line")
                odds = entry.get("odds")
                if not player or not isinstance(line, (int, float)) or not isinstance(odds, (int, float)):
                    continue
                if line <= 0 or odds < 1.0:
                    continue
                key = f"{player.lower()}|{stat_code}|{line}"
                if key in seen:
                    continue
                seen.add(key)
                all_legs.append({"player": player, "stat": stat_code, "line": float(line), "price": float(odds)})
                print(f"[extract]   ✓ {player} {stat_code} {line}+ @ {odds}")

        except Exception as e:
            print(f"[extract] Gemini error: {e}", file=sys.stderr)

    return all_legs


async def run(args):
    api_key = args.geminiKey or os.environ.get("GEMINI_API_KEY", "")
    secret = args.oddsSecret or os.environ.get("ODDS_UPLOAD_SECRET", "")

    if not api_key:
        print("ERROR: GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    if not secret:
        print("ERROR: ODDS_UPLOAD_SECRET not set", file=sys.stderr)
        sys.exit(1)

    dump_dir = Path(args.dumpDir) if args.dumpDir else None

    print(f"\n[connect] Connecting to Chrome on port {CHROME_DEBUG_PORT}...")
    tab = get_bet365_tab()
    ws_url = tab["webSocketDebuggerUrl"]
    print(f"[connect] Tab: {tab.get('title', 'Unknown')} — {tab.get('url', '')[:80]}")

    all_legs = []
    seen: set[str] = set()

    # Extract from the page as-is (user should be on player props already)
    section_count = 0
    while True:
        section_count += 1
        print(f"\n[connect] === Extracting section {section_count} ===")
        print("[connect] Make sure the correct props tab is visible in Chrome, then press Enter...")
        input()

        legs = await extract_from_current_page(ws_url, api_key, dump_dir, args.gameId)
        print(f"[connect] Found {len(legs)} props in this section")

        for leg in legs:
            key = f"{leg['player'].lower()}|{leg['stat']}|{leg['line']}"
            if key not in seen:
                seen.add(key)
                all_legs.append(leg)

        print(f"[connect] Total unique props so far: {len(all_legs)}")
        print("\nNavigate to the next section (Player Goals, Player Marks, etc.) and press Enter,")
        print("or type 'done' and press Enter to upload what we have:")
        answer = input().strip().lower()
        if answer == "done" or not answer:
            break

    if not all_legs:
        print("[connect] No props extracted. Did you navigate to the player props page?", file=sys.stderr)
        sys.exit(1)

    print(f"\n[connect] Uploading {len(all_legs)} legs to {args.upload}...")
    payload = {
        "gameId": args.gameId,
        "bookie": "bet365",
        "timestamp": int(time.time() * 1000),
        "legs": all_legs,
    }
    if args.kickoffMs:
        payload["kickoffAt"] = int(args.kickoffMs)
    if args.expiresAtMs:
        payload["expiresAt"] = int(args.expiresAtMs)

    ok = upload_odds(args.upload, secret, payload)
    if ok:
        print(f"[connect] ✓ Upload successful — {len(all_legs)} legs live on DegenHUB")
    else:
        print("[connect] ✗ Upload failed", file=sys.stderr)
        sys.exit(1)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--gameId", required=True)
    p.add_argument("--homeTeam", default="")
    p.add_argument("--awayTeam", default="")
    p.add_argument("--upload", required=True)
    p.add_argument("--kickoffMs", type=int, default=None)
    p.add_argument("--expiresAtMs", type=int, default=None)
    p.add_argument("--geminiKey", default="")
    p.add_argument("--oddsSecret", default="")
    p.add_argument("--dumpDir", default=None)
    p.add_argument("--port", type=int, default=CHROME_DEBUG_PORT)
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(run(args))
