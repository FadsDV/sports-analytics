# DegenHUB Odds Provider Architecture

Foundational sportsbook provider architecture for normalized odds integration.

## Folder Structure
- `types.ts`: Shared normalized types (`OddsEvent`, `BookmakerOdds`, `OddsMarket`, `OddsOutcome`)
- `interface.ts`: `OddsProvider` interface for all implementations
- `index.ts`: `oddsManager` singleton for orchestrating providers
- `cache.ts`: Lightweight in-memory cache layer
- `utils.ts`: Normalization and formatting utilities
- `the-odds-api.ts`: Implementation for [The Odds API](https://the-odds-api.com/)
- `pandascore.ts`: Implementation for [PandaScore](https://pandascore.co/) (Esports)

## Normalization Strategy
All providers MUST normalize their raw API responses into the `OddsEvent` schema defined in `types.ts`.
This ensures the frontend consumes a consistent structure regardless of the data source.

### Example Normalization (The Odds API)
```typescript
// Raw from provider
{
  "id": "...",
  "home_team": "Collingwood",
  "away_team": "Brisbane",
  "bookmakers": [...]
}

// Normalized to DegenHUB
{
  id: "...",
  homeTeam: "Collingwood",
  awayTeam: "Brisbane",
  bookmakers: [...]
}
```

## Cache Strategy
A simple in-memory cache is used to prevent redundant API calls. 
- Default TTL: 5 minutes
- Stable cache keys based on provider, sport, and requested markets.
- Future: Ready for Redis integration by swapping the `OddsCache` implementation.

## Scaling Approach
- **New Providers**: Implement the `OddsProvider` interface and register in `index.ts`.
- **Live Odds**: The architecture supports adding `getLiveOdds` to the interface.
- **Scraping**: Scrapers can be implemented as providers that fulfill the same interface.
- **Redis**: The `OddsCache` can be extended to use Redis for shared caching across Vercel instances.
