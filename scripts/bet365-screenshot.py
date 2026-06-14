#!/usr/bin/env python3
"""
DegenHUB — Bet365 Screen Screenshot Extractor
==============================================

Uses your NORMAL Firefox browser (no automation, no detection risk).
Takes OS-level screenshots of what's on screen and extracts odds via Gemini Vision.

Workflow:
  1. Open Firefox → go to Bet365 → navigate to the AFL game → Player Disposals tab
  2. Make sure Firefox is fullscreen / maximized and odds are visible
  3. Run this script — it will screenshot your screen and extract
  4. Script asks you to switch to next tab (Player Goals, Marks, etc.)
  5. Type 'done' when finished — uploads everything

Usage:
  python3 scripts/bet365-screenshot.py \\
    --gameId afl-XXXXX \\
    --upload https://sports-analytics-plum.vercel.app

Env vars:
  GEMINI_API_KEY      — Google Gemini API key
  ODDS_UPLOAD_SECRET  — Auth token for /api/odds/upload
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

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
  * "25+ disposals" → line: 25.0
  * "1+ goals" → line: 1.0
  * "2+ goals" → line: 2.0
- odds: the decimal odds as a float (e.g. 1.85, 2.10, 1.05)

Rules:
- Only include entries where BOTH player name AND decimal odds number are clearly readable
- Do NOT include match result, line betting, head-to-head, totals, or "First Goalscorer"
- Do NOT guess or invent anything — if unclear, skip it
- If the same player appears multiple times with different lines, include all of them

Return ONLY a valid JSON array, no explanation, no markdown:
[{"playerName": "...", "statType": "...", "line": 20.0, "odds": 1.85}]

If no player props are visible, return exactly: []
"""


# ─── Screenshot ───────────────────────────────────────────────────────────────

def take_screenshot(output_path: Path) -> bool:
    """
    Take a screenshot of the full screen using available Linux tools.
    Tries multiple methods with fallbacks.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    path_str = str(output_path)

    # Method 1: scrot (lightweight, common)
    try:
        result = subprocess.run(
            ["scrot", "-z", path_str],
            capture_output=True, timeout=10
        )
        if result.returncode == 0 and output_path.exists():
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Method 2: gnome-screenshot (GNOME desktop)
    try:
        result = subprocess.run(
            ["gnome-screenshot", "-f", path_str],
            capture_output=True, timeout=10
        )
        if result.returncode == 0 and output_path.exists():
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Method 3: import from ImageMagick
    try:
        result = subprocess.run(
            ["import", "-window", "root", path_str],
            capture_output=True, timeout=10
        )
        if result.returncode == 0 and output_path.exists():
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Method 4: xwd + convert (ImageMagick)
    try:
        xwd_path = output_path.with_suffix(".xwd")
        subprocess.run(["xwd", "-root", "-silent", "-out", str(xwd_path)], timeout=10, check=True)
        subprocess.run(["convert", str(xwd_path), path_str], timeout=10, check=True)
        xwd_path.unlink(missing_ok=True)
        if output_path.exists():
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError):
        pass

    # Method 5: Python PIL + pyscreenshot
    try:
        import PIL.ImageGrab
        img = PIL.ImageGrab.grab()
        img.save(path_str)
        return output_path.exists()
    except Exception:
        pass

    return False


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


# ─── Extraction ───────────────────────────────────────────────────────────────

def extract_from_screenshot(screenshot_path: Path, api_key: str) -> list[dict]:
    """Send screenshot to Gemini and extract player props."""
    img_bytes = screenshot_path.read_bytes()
    img_b64 = base64.b64encode(img_bytes).decode("utf-8")

    print(f"[gemini] Analysing screenshot ({len(img_bytes) // 1024}KB)...")
    raw = call_gemini(api_key, img_b64, EXTRACTION_PROMPT)
    entries = parse_gemini_json(raw)

    legs = []
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
        legs.append({"player": player, "stat": stat_code, "line": float(line), "price": float(odds)})
        print(f"  ✓ {player} {stat_code} {line}+ @ {odds}")

    return legs


# ─── Main ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--gameId", required=True)
    p.add_argument("--homeTeam", default="")
    p.add_argument("--awayTeam", default="")
    p.add_argument("--upload", required=True)
    p.add_argument("--kickoffMs", type=int, default=None)
    p.add_argument("--expiresAtMs", type=int, default=None)
    p.add_argument("--geminiKey", default=os.environ.get("GEMINI_API_KEY", ""))
    p.add_argument("--oddsSecret", default=os.environ.get("ODDS_UPLOAD_SECRET", ""))
    p.add_argument("--dumpDir", default="data/local/bet365-worker/captures")
    return p.parse_args()


def main():
    args = parse_args()

    if not args.geminiKey:
        print("ERROR: GEMINI_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    if not args.oddsSecret:
        print("ERROR: ODDS_UPLOAD_SECRET not set", file=sys.stderr)
        sys.exit(1)

    dump_dir = Path(args.dumpDir)
    dump_dir.mkdir(parents=True, exist_ok=True)

    # Check screenshot tool is available
    test_path = dump_dir / "_test_shot.png"
    if not take_screenshot(test_path):
        print(
            "\nERROR: No screenshot tool found. Install one:\n"
            "  sudo dnf install scrot\n"
            "  or: sudo dnf install gnome-screenshot",
            file=sys.stderr
        )
        sys.exit(1)
    test_path.unlink(missing_ok=True)
    print("[screenshot] Screenshot tool working ✓")

    print(f"\n{'='*60}")
    print(f"DegenHUB — Bet365 Odds Extractor")
    print(f"Game: {args.homeTeam or 'Unknown'} vs {args.awayTeam or 'Unknown'}")
    print(f"{'='*60}")
    print("\nInstructions:")
    print("  1. Make sure Firefox is open and fullscreen on the Bet365 player props page")
    print("  2. Press Enter to screenshot + extract")
    print("  3. Switch to next tab (Goals, Marks, etc.) and press Enter again")
    print("  4. Type 'done' when finished\n")

    all_legs = []
    seen: set[str] = set()
    section = 0

    while True:
        section += 1
        print(f"\n--- Section {section} ---")
        print("Navigate to the props tab in Firefox, then press Enter to screenshot")
        print("(or type 'done' to upload what we have):")

        answer = input("> ").strip().lower()
        if answer == "done":
            break

        # Take screenshot (3 second delay so user can switch window)
        print("[screenshot] Taking screenshot in 2 seconds...")
        time.sleep(2)

        shot_path = dump_dir / f"{args.gameId}-section{section}-{int(time.time())}.png"
        if not take_screenshot(shot_path):
            print("[screenshot] Failed to take screenshot", file=sys.stderr)
            continue

        print(f"[screenshot] Saved: {shot_path.name}")

        # Extract
        try:
            legs = extract_from_screenshot(shot_path, args.geminiKey)
        except Exception as e:
            print(f"[gemini] Error: {e}", file=sys.stderr)
            continue

        new_count = 0
        for leg in legs:
            key = f"{leg['player'].lower()}|{leg['stat']}|{leg['line']}"
            if key not in seen:
                seen.add(key)
                all_legs.append(leg)
                new_count += 1

        print(f"\n  Found {len(legs)} props, {new_count} new → {len(all_legs)} total")

    if not all_legs:
        print("\nNo props extracted. Make sure Firefox was showing the player props page.", file=sys.stderr)
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"Uploading {len(all_legs)} legs to {args.upload}...")

    payload = {
        "gameId": args.gameId,
        "bookie": "bet365",
        "timestamp": int(time.time() * 1000),
        "legs": all_legs,
    }
    if args.kickoffMs:
        payload["kickoffAt"] = args.kickoffMs
    if args.expiresAtMs:
        payload["expiresAt"] = args.expiresAtMs

    if upload_odds(args.upload, args.oddsSecret, payload):
        print(f"✓ Upload successful — {len(all_legs)} legs live on DegenHUB")
    else:
        print("✗ Upload failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
