#!/usr/bin/env bash
# DegenHUB — Launch Chrome with remote debugging for Bet365 scraping
#
# Run this once. Chrome opens with a persistent profile that remembers
# your session between runs (cookies, preferences, etc.)
#
# Usage:
#   bash scripts/start-bet365-chrome.sh

PROFILE_DIR="$HOME/.bet365-chrome-debug"
mkdir -p "$PROFILE_DIR"

echo "=== Starting Chrome with remote debugging ==="
echo ""
echo "1. Chrome will open now"
echo "2. Navigate to: AFL → the game you want → Player Disposals / Player Goals tabs"
echo "3. Once you can see the player props on screen, run:"
echo ""
echo "   python3 scripts/bet365-connect.py \\"
echo "     --gameId afl-XXXXX \\"
echo "     --homeTeam 'Richmond Tigers' \\"
echo "     --awayTeam 'Brisbane Lions' \\"
echo "     --upload https://sports-analytics-plum.vercel.app"
echo ""
echo "Chrome is starting..."

google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  --window-size=1400,900 \
  --no-first-run \
  --no-default-browser-check \
  "https://www.bet365.com.au/" &

echo "Chrome started (PID $!)"
echo "Waiting for it to load..."
sleep 3
echo "Ready. Navigate to the game's player props page, then run bet365-connect.py"
