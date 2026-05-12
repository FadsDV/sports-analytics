# DegenHUB Architecture Rules
- SofaScore
- Bloomberg Terminal
- professional analytics software

Focus on:
- readability
- real data
- fast workflows
- player research
- matchup intelligence

Avoid:
- clutter
- gimmicks
- fake projections

---

# Current Architecture

## Roster Authority Layer
Official AFL club sites are the source of truth for:
- current team membership
- active players
- player roles
- guernsey numbers

## Stats Layer
ESPN is used for:
- live stats
- box scores
- game summaries
- schedules
- historical logs

## Headshot Layer
AFL CDN is preferred for official player images.

## Intelligence Layer
Custom DegenHUB analytics include:
- matchup insights
- form analysis
- venue edges
- weather impact
- H2H trends
- live intelligence

---

# Future Direction

Planned future systems:
- betting intelligence
- odds comparison
- soccer match visualization
- shot maps
- momentum engines
- Counter-Strike esports analytics
- live event rendering

---

# Workflow Expectations

Before making changes:
1. Read CLAUDE.md
2. Audit existing implementation
3. Avoid touching unrelated systems
4. Preserve current architecture
5. Keep changes scoped tightly

Always:
- explain what changed
- list modified files
- run npm run build
