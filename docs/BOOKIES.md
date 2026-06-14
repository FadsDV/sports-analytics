# DegenHUB — Bookie Market Reference (AFL SGM)

> Compiled from Dabble and Bet365 AFL SGM screenshots.
> This is the source of truth for bookie-specific kitchen logic.
> Never push `data/local/` — it contains the local slip database.

---

## Bet365 — AFL SGM Markets

### Disposals

**Milestone ladders** (snap threshold to nearest valid step):
```
10+  15+  20+  25+  30+  35+
```
Increments of 5, starting at 10.

**Disposal lines** (Over/Under, half-point):
- Over/Under X.5 — e.g. Over 19.5, Over 23.5, Over 21.5
- These are set per-player by the bookie (no fixed ladder)
- More flexible than milestones — use when odds are available

### Goalscorer
```
Anytime (1+)    2+    3+
```
❌ 4+ and 5+ are NOT available on Bet365.

### NOT Available on Bet365 AFL SGM
- ❌ Kicks
- ❌ Handballs
- ❌ Tackles
- ❌ Marks
- ❌ Quarter-specific disposal ladders
- ❌ Live-only additional SGM categories

### Summary (Bet365)
| Stat | Available | Valid Lines |
|------|-----------|-------------|
| Disposals | ✅ | 10, 15, 20, 25, 30, 35 |
| Goals | ✅ | 1 (Anytime), 2, 3 |
| Marks | ❌ | — |
| Tackles | ❌ | — |
| Kicks | ❌ | — |
| Handballs | ❌ | — |
| Hitouts | ❌ | — |

---

## Dabble — AFL SGM Markets

### Disposals

**Milestone ladders** (snap threshold to nearest valid step):
```
15+  20+  25+  30+
```
⚠️ Dabble starts at 15+ (no 10+ like Bet365).

### Goalscorer (Full match)
```
Anytime (1+)    2+    3+    4+    5+
```
✅ Dabble has 4+ and 5+ goals (Bet365 does not).

### First Quarter Goalscorer
```
Anytime    2+    3+    4+    5+
```

### First Half Goalscorer
```
Anytime    2+    3+    4+    5+
```

### Marks Ladders
```
2+  3+  4+  5+  6+  7+  8+  9+  10+  11+  12+
```
Every integer from 2 to 12.

### Handball Ladders
```
4+  5+  6+  7+  8+  9+  10+  11+  12+  13+
```
Every integer from 4 to 13.

### Kick Ladders
```
5+  6+  7+  8+  9+  10+  11+  12+
```
Every integer from 5 to 12.

### Tackle Ladders
```
2+  3+  4+  5+  6+  7+  8+  9+  10+  11+
```
Every integer from 2 to 11.

### Combined Disposal Markets (Dabble only)
- Player combined number of disposals
- Player OR number of disposals

### Summary (Dabble)
| Stat | Available | Valid Lines |
|------|-----------|-------------|
| Disposals | ✅ | 15, 20, 25, 30 |
| Goals | ✅ | 1 (Anytime), 2, 3, 4, 5 |
| Marks | ✅ | 2–12 (every integer) |
| Tackles | ✅ | 2–11 (every integer) |
| Kicks | ✅ | 5–12 (every integer) |
| Handballs | ✅ | 4–13 (every integer) |
| Hitouts | ❌ | — |

---

## Key Differences At a Glance

| Feature | Bet365 | Dabble |
|---------|--------|--------|
| Disposal ladder start | 10+ | 15+ |
| Disposal ladder step | 5 | 5 |
| Disposal highest | 35+ | 30+ |
| Disposal lines (Over/Under) | ✅ X.5 | ❌ |
| Goals max | 3+ | 5+ |
| Marks | ❌ | ✅ 2–12 |
| Tackles | ❌ | ✅ 2–11 |
| Kicks | ❌ | ✅ 5–12 |
| Handballs | ❌ | ✅ 4–13 |
| Hitouts | ❌ | ❌ |
| Quarter goalscorer | ❌ | ✅ |
| Half goalscorer | ❌ | ✅ |
| Combined disposals | ❌ | ✅ |

---

## Kitchen Snap Logic

When generating bookie-specific slips, thresholds are **snapped** to the nearest valid line on that bookie:

### Bet365 snap rules
- Disposals: round to nearest 5 within [10, 35] — e.g. 22 → 20, 23 → 25
- Goals: round down to nearest valid option [1, 2, 3] — e.g. 3.5 → 3
- All other stats: skip (not available)

### Dabble snap rules
- Disposals: round to nearest 5 within [15, 30] — e.g. 17 → 15, 22 → 20, 14 → skip
- Goals: round down to nearest valid option [1, 2, 3, 4, 5]
- Marks: round to nearest integer within [2, 12]
- Tackles: round to nearest integer within [2, 11]
- Kicks: round to nearest integer within [5, 12]
- Handballs: round to nearest integer within [4, 13]
- Hitouts: skip (not available on either bookie)

---

## Future Bookies (To Be Added)

- **Sportsbet** — rules TBD
- **Ladbrokes** — rules TBD
- **TAB** — rules TBD
