/**
 * Provider Health Utilities
 * 
 * Tracks API health, rate limits, and failure rates.
 */

export interface HealthStatus {
  lastCheck: string;
  isHealthy: boolean;
  failureCount: number;
  lastError?: string;
  rateLimitRemaining?: number;
}

class EsportsProviderHealth {
  private healthMap: Map<string, HealthStatus> = new Map();
  private readonly FAILURE_THRESHOLD = 5;

  getHealth(providerId: string): HealthStatus {
    return this.healthMap.get(providerId) || {
      lastCheck: new Date().toISOString(),
      isHealthy: true,
      failureCount: 0
    };
  }

  recordSuccess(providerId: string, rateLimitRemaining?: number) {
    const health = this.getHealth(providerId);
    this.healthMap.set(providerId, {
      ...health,
      lastCheck: new Date().toISOString(),
      isHealthy: true,
      failureCount: 0,
      rateLimitRemaining
    });
  }

  recordFailure(providerId: string, error: string) {
    const health = this.getHealth(providerId);
    const newCount = health.failureCount + 1;
    this.healthMap.set(providerId, {
      ...health,
      lastCheck: new Date().toISOString(),
      failureCount: newCount,
      isHealthy: newCount < this.FAILURE_THRESHOLD,
      lastError: error
    });
  }

  isHealthy(providerId: string): boolean {
    const health = this.getHealth(providerId);
    if (health.rateLimitRemaining !== undefined && health.rateLimitRemaining === 0) {
      return false;
    }
    return health.isHealthy;
  }

  getThreshold(providerId: string): number {
    return (this.getHealth(providerId).rateLimitRemaining || 100);
  }
}

export const providerHealth = new EsportsProviderHealth();
