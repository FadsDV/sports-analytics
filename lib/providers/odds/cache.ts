interface CacheItem<T> {
  data: T;
  expiry: number;
}

export class OddsCache {
  private cache: Map<string, CacheItem<any>> = new Map();

  /**
   * Default TTL of 5 minutes (300,000ms)
   */
  private defaultTTL: number;

  constructor(defaultTTLSeconds: number = 300) {
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTTL;
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Generate a stable cache key
   */
  static generateKey(providerId: string, sport: string, markets?: string[]): string {
    const marketStr = markets ? markets.sort().join(",") : "all";
    return `${providerId}:${sport}:${marketStr}`;
  }
}

// Singleton instance for global use
export const oddsCache = new OddsCache();
