#!/usr/bin/env bash
# DegenHUB — Bet365 scraper one-time setup
# Run once on the mini PC, then the worker handles everything automatically.
#
# Usage:
#   cd /home/fads/sports-analytics
#   bash scripts/bet365-setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=== DegenHUB Bet365 Scraper Setup ==="
echo ""

# ── 1. Install Python dependency ──────────────────────────────────────────────
echo "[1/4] Installing selenium-driverless..."
pip install selenium-driverless --break-system-packages --quiet
echo "      ✓ selenium-driverless installed"

# ── 2. Verify Chrome is installed ─────────────────────────────────────────────
echo "[2/4] Checking for Google Chrome..."
CHROME_BIN=""
for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" &>/dev/null; then
        CHROME_BIN=$(command -v "$candidate")
        break
    fi
done

if [[ -z "$CHROME_BIN" ]]; then
    echo ""
    echo "      ✗ Chrome not found. Install it:"
    echo "        Fedora: sudo dnf install google-chrome-stable"
    echo "        Or download from: https://www.google.com/chrome/"
    echo ""
    echo "      selenium-driverless needs Chrome to run."
    exit 1
else
    echo "      ✓ Chrome found: $CHROME_BIN"
fi

# ── 3. Create data directories ────────────────────────────────────────────────
echo "[3/4] Creating data directories..."
mkdir -p "$REPO_ROOT/data/local/bet365-worker/jobs"
mkdir -p "$REPO_ROOT/data/local/bet365-worker/captures"
echo "      ✓ Directories ready"

# ── 4. Verify env vars ────────────────────────────────────────────────────────
echo "[4/4] Checking environment variables..."
MISSING=0

if [[ -z "$GEMINI_API_KEY" ]]; then
    echo "      ✗ GEMINI_API_KEY not set"
    MISSING=1
else
    echo "      ✓ GEMINI_API_KEY set"
fi

if [[ -z "$ODDS_UPLOAD_SECRET" ]]; then
    echo "      ✗ ODDS_UPLOAD_SECRET not set"
    MISSING=1
else
    echo "      ✓ ODDS_UPLOAD_SECRET set"
fi

echo ""
if [[ $MISSING -eq 1 ]]; then
    echo "⚠  Add missing env vars to ~/.bashrc or /etc/environment:"
    echo "   export GEMINI_API_KEY=your-key-here"
    echo "   export ODDS_UPLOAD_SECRET=your-secret-here"
    echo ""
fi

echo "=== Setup complete ==="
echo ""
echo "To run the worker continuously (checks every 30 mins for upcoming games):"
echo ""
echo "  cd $REPO_ROOT"
echo "  while true; do"
echo "    node scripts/run-bet365-worker.mjs --upload https://your-app.vercel.app"
echo "    sleep 1800"
echo "  done"
echo ""
echo "Or test immediately on Richmond vs Brisbane Lions:"
echo ""
echo "  python3 scripts/scrape-bet365-auto.py \\"
echo "    --gameId afl-test \\"
echo "    --homeTeam 'Richmond Tigers' \\"
echo "    --awayTeam 'Brisbane Lions' \\"
echo "    --upload https://your-app.vercel.app \\"
echo "    --dumpDir data/local/bet365-worker/captures"
echo ""
echo "First run will open a Chrome window — Bet365 may ask you to verify you're"
echo "human (CAPTCHA / click). Do it once and the session saves for future runs."
