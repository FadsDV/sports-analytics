# Bet365 Scraper — Progress Notes

**Last updated:** 2026-06-13

## Status: PAUSED — Bet365 temporarily soft-blocked after automation attempts

## What works
- `scripts/bet365-screenshot.py` — takes OS-level screenshots of real Firefox, sends to Gemini Vision, extracts player props, uploads to `/api/odds/upload`
- `scripts/bet365-connect.py` — connects to Chrome via CDP remote debugging (blocked by Bet365 currently)
- `scripts/run-bet365-worker.mjs` — scheduler that auto-triggers scraper 24h and 1h before each AFL game
- `scripts/scrape-bet365-auto.py` — selenium-driverless attempt (blocked: Bet365 renders inside iframes, `execute_script` runs in wrong context)
- `ODDS_UPLOAD_SECRET=dh-bet365-upload-2026` — set in `.env.local`, needs adding to Vercel env vars

## The core problem
Bet365 renders its entire UI inside iframes. The main document body only has ~1.6KB of footer/legal text. All sport navigation, game listings, and odds are inside nested iframes. This breaks:
- XPath element finding (finds nothing)
- `execute_script` DOM queries (wrong execution context)
- Any URL-based hash navigation (redirects to home)

## The working approach (use this when Bet365 unblocks)
**`bet365-screenshot.py` — screen screenshot + Gemini Vision**

1. Wait for soft-block to clear (~1 hour)
2. Disable VPN on Firefox
3. Clear Firefox cookies for bet365.com.au
4. Open Firefox → AFL → game → Player Disposals Milestones tab
5. Install scrot: `sudo dnf install -y scrot`
6. Run:
```bash
cd /home/fads/sports-analytics
GEMINI_API_KEY=AIzaSyCoTzaqzdfXyRpKHy2V2lizB8crIKdRhu8 \
ODDS_UPLOAD_SECRET=dh-bet365-upload-2026 \
python3 scripts/bet365-screenshot.py \
  --gameId afl-test \
  --homeTeam "Richmond Tigers" \
  --awayTeam "Brisbane Lions" \
  --upload https://sports-analytics-plum.vercel.app
```

## Still to do
- [ ] Confirm which Gemini model works (run model list curl command)
- [ ] Add ODDS_UPLOAD_SECRET to Vercel env vars
- [ ] Test `bet365-screenshot.py` end-to-end with a real game
- [ ] Once extraction confirmed working, hook into `run-bet365-worker.mjs` for full automation
- [ ] Investigate iframe switching in selenium-driverless for future headless automation

## Next game
Richmond Tigers vs Brisbane Lions — Sun 14 Jun, 14:10 AEST
