/**
 * PandaScore API Client
 * 
 * Handles authentication, rate limiting, and core fetch logic for PandaScore.
 */

import { esportsCache } from "../cache";
import { providerHealth } from "../health";

export interface PandaScoreConfig {
  apiKey: string;
  baseUrl: string;
  ttl?: number;
}

export class PandaScoreError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(`PandaScore API Error (${status}): ${message}`);
    this.name = "PandaScoreError";
  }
}

export class PandaScoreClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTtl: number;
  private readonly providerId = "pandascore";

  constructor(config?: Partial<PandaScoreConfig>) {
    this.apiKey = config?.apiKey || process.env.PANDASCORE_API_KEY || "";
    this.baseUrl = config?.baseUrl || "https://api.pandascore.co";
    this.defaultTtl = config?.ttl || 60 * 1000;

    if (!this.apiKey && process.env.NODE_ENV === "production") {
      console.warn("PandaScore API key is missing");
    }
  }

  /**
   * Core fetch utility with caching, retries, and health tracking
   */
  async fetch<T>(endpoint: string, params: Record<string, string | number> = {}, ttl?: number): Promise<T> {
    const cacheKey = `${endpoint}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;
    
    // Cache check
    const cached = esportsCache.get<T>(cacheKey);
    if (cached) return cached;

    // Health check
    if (!providerHealth.isHealthy(this.providerId)) {
      throw new Error(`PandaScore provider is currently unhealthy. Last error: ${providerHealth.getHealth(this.providerId).lastError}`);
    }

    const url = new URL(`${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
          },
        });

        // Rate limit handling
        const remaining = response.headers.get("X-Rate-Limit-Remaining");
        if (remaining) {
          providerHealth.recordSuccess(this.providerId, parseInt(remaining));
          if (parseInt(remaining) < 10) {
            console.warn(`PandaScore Rate Limit Warning: ${remaining} requests remaining`);
          }
        } else {
          providerHealth.recordSuccess(this.providerId);
        }

        if (!response.ok) {
          let errorData;
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: response.statusText };
          }
          throw new PandaScoreError(response.status, errorData.error || errorData.message, errorData);
        }

        const data = await response.json();
        esportsCache.set(cacheKey, data, ttl || this.defaultTtl);
        return data as T;
      } catch (err: any) {
        lastError = err;
        if (err instanceof PandaScoreError && err.status === 429) {
          providerHealth.recordFailure(this.providerId, "Rate limit exceeded");
          break; // Don't retry rate limits immediately
        }
        if (attempt === 3) break;
        await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Exponential backoff
      }
    }

    providerHealth.recordFailure(this.providerId, lastError?.message || "Unknown error");
    throw lastError;
  }

  /**
   * Helper for paginated requests
   */
  async fetchAll<T>(endpoint: string, params: Record<string, string | number> = {}, maxPages = 5): Promise<T[]> {
    let allData: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      const data = await this.fetch<T[]>(endpoint, { ...params, page, per_page: 100 });
      allData = [...allData, ...data];
      
      if (data.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return allData;
  }
}
