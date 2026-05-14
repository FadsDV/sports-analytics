/**
 * eSports Response Caching & Request Deduplication
 * 
 * Provides in-memory caching and prevents duplicate concurrent requests.
 */

import { esportsLogger } from "./logger";

interface CacheMetadata {
  fetchedAt: number;
  provider: string;
  isStale: boolean;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
  metadata: CacheMetadata;
}

class EsportsCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private inflightRequests: Map<string, Promise<any>> = new Map();
  private readonly DEFAULT_TTL = 60 * 1000; // 1 minute

  /**
   * Prevents multiple identical requests from running at the same time.
   */
  async deduplicate<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    const existing = this.inflightRequests.get(key);
    if (existing) {
      esportsLogger.debug(`Deduplicated request: ${key}`);
      return existing;
    }

    const promise = requestFn().finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, promise);
    return promise;
  }

  set<T>(key: string, data: T, provider: string, ttlMs: number = this.DEFAULT_TTL) {
    const timestamp = Date.now();
    this.cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + ttlMs,
      metadata: {
        fetchedAt: timestamp,
        provider,
        isStale: false
      }
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      // Return null if expired, but we could implement SWR here if needed
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  getWithMetadata<T>(key: string): { data: T, metadata: CacheMetadata } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isStale = Date.now() > entry.expiresAt;
    
    return {
      data: entry.data,
      metadata: {
        ...entry.metadata,
        isStale
      }
    };
  }

  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    return Date.now() > entry.expiresAt;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.inflightRequests.clear();
  }
}

export const esportsCache = new EsportsCache();
