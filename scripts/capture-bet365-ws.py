#!/usr/bin/env python3
"""
scripts/capture-bet365-ws.py
mitmproxy addon — intercepts Bet365 WebSocket frames from a real Floorp browser session.

Phase 1 (trial): Saves all WS messages to a JSON file for inspection.
Phase 2 (parse): Once the message format is known, parses and uploads to /api/odds/upload.

Usage:
  mitmdump -s scripts/capture-bet365-ws.py --listen-port 8080
  mitmdump -s scripts/capture-bet365-ws.py --listen-port 8080 --set upload=https://your-app.vercel.app
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "local", "bet365-captures")
ENV_FILE   = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.scraper")

BET365_HOSTS = {
    "premws-pt1.365lpodds.com",
    "premws-pt2.365lpodds.com",
    "premws-pt3.365lpodds.com",
    "pshudws.z1.365lpodds.com",
}

# Load ODDS_UPLOAD_SECRET from .env.scraper or environment
UPLOAD_SECRET = os.environ.get("ODDS_UPLOAD_SECRET", "")
if not UPLOAD_SECRET and os.path.exists(ENV_FILE):
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("ODDS_UPLOAD_SECRET="):
                UPLOAD_SECRET = line.split("=", 1)[1].strip()
                break

# ── Addon ─────────────────────────────────────────────────────────────────────

class Bet365Capture:
    def __init__(self):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.output_file = os.path.join(OUTPUT_DIR, f"ws-capture-{ts}.json")
        self.messages = []
        self.ws_connections = {}
        self.upload_base = None  # set via --set upload=... flag

        print(f"[bet365] Capture script loaded.")
        print(f"[bet365] Output file: {self.output_file}")
        print(f"[bet365] Watching hosts: {', '.join(BET365_HOSTS)}")

    def load(self, loader):
        loader.add_option(
            name="upload",
            typespec=str,
            default="",
            help="Base URL to upload parsed odds to (e.g. https://your-app.vercel.app)",
        )

    def configure(self, updates):
        if "upload" in updates:
            val = self.options.upload if hasattr(self, "options") else ""
            # mitmproxy passes options via ctx.options
            try:
                from mitmproxy import ctx
                val = ctx.options.upload
            except Exception:
                pass
            if val:
                self.upload_base = val.rstrip("/")
                print(f"[bet365] Upload target: {self.upload_base}")
            else:
                print(f"[bet365] Trial mode — raw capture only, no upload.")

    def websocket_start(self, flow):
        if flow.request.host not in BET365_HOSTS:
            return
        url = flow.request.pretty_url
        self.ws_connections[flow.id] = url
        print(f"[bet365] ✓ WS connected: {url}")

    def websocket_message(self, flow):
        if flow.request.host not in BET365_HOSTS:
            return

        msg = flow.websocket.messages[-1]
        try:
            text = msg.content.decode("utf-8", errors="replace")
        except Exception:
            return

        entry = {
            "ts": time.time(),
            "url": self.ws_connections.get(flow.id, flow.request.pretty_url),
            "from_client": msg.from_client,
            "text": text,
        }
        self.messages.append(entry)

        direction = "→ CLIENT" if msg.from_client else "← SERVER"
        preview = text[:140].replace("\n", " ")
        print(f"[bet365] {direction} | {preview}")

        self._save()

        # Phase 2 — parse and upload server messages
        if self.upload_base and not msg.from_client:
            self._try_parse_and_upload(text)

    def websocket_end(self, flow):
        if flow.request.host not in BET365_HOSTS:
            return
        print(f"[bet365] WS closed: {self.ws_connections.get(flow.id, '?')}")
        self._save()

    def done(self):
        self._save()
        print(f"[bet365] Finished. {len(self.messages)} messages saved to {self.output_file}")

    # ── Internal ──────────────────────────────────────────────────────────────

    def _save(self):
        try:
            with open(self.output_file, "w", encoding="utf-8") as f:
                json.dump({
                    "captured_at": datetime.now(timezone.utc).isoformat(),
                    "total": len(self.messages),
                    "messages": self.messages,
                }, f, indent=2)
        except Exception as e:
            print(f"[bet365] Save error: {e}")

    def _try_parse_and_upload(self, text: str):
        """
        Phase 2 parser — not yet implemented.

        Once we've inspected the captured messages in ws-capture-*.json
        and understand the Bet365 WS protocol format, this function will:
          1. Extract gameId, player names, stat types, lines, and prices
          2. Call self._upload(gameId, "bet365", legs)

        For now it's a no-op — the raw messages are saved to the output file
        for manual inspection.
        """
        pass

    def _upload(self, game_id: str, bookie: str, legs: list):
        """POST parsed odds to /api/odds/upload on the Vercel app."""
        if not self.upload_base or not UPLOAD_SECRET:
            print("[bet365] Upload skipped — missing upload base or secret.")
            return

        payload = json.dumps({
            "gameId":     game_id,
            "bookie":     bookie,
            "timestamp":  int(time.time() * 1000),
            "legs":       legs,
        }).encode("utf-8")

        req = urllib.request.Request(
            f"{self.upload_base}/api/odds/upload",
            data=payload,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {UPLOAD_SECRET}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as res:
                body = res.read().decode("utf-8")
                print(f"[bet365] ✓ Uploaded {len(legs)} legs for {game_id} → {res.status} {body[:80]}")
        except urllib.error.HTTPError as e:
            print(f"[bet365] Upload HTTP error: {e.code} {e.reason}")
        except Exception as e:
            print(f"[bet365] Upload error: {e}")


addons = [Bet365Capture()]
