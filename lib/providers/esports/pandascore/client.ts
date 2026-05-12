/**
 * PandaScore API Client
 * 
 * Handles authentication, rate limiting, and core fetch logic for PandaScore.
 */

export interface PandaScoreConfig {
  apiKey: string;
  baseUrl: string;
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

  constructor(config?: Partial<PandaScoreConfig>) {
    this.apiKey = config?.apiKey || process.env.PANDASCORE_API_KEY || "";
    this.baseUrl = config?.baseUrl || "https://api.pandascore.co";

    if (!this.apiKey && process.env.NODE_ENV === "production") {
      console.warn("PandaScore API key is missing");
    }
  }

  /**
   * Core fetch utility with error handling and rate limit detection
   */
  async fetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Accept": "application/json",
      },
    });

    // Rate limit handling
    const remaining = response.headers.get("X-Rate-Limit-Remaining");
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`PandaScore Rate Limit Warning: ${remaining} requests remaining`);
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

    return response.json() as Promise<T>;
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
