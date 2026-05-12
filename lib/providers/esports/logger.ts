/**
 * eSports Provider Logging Utility
 * 
 * Provides structured logging for eSports data ingestion and normalization.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  provider?: string;
  game?: string;
  matchId?: string | number;
  tournamentId?: string | number;
  [key: string]: any;
}

class EsportsLogger {
  private isProduction = process.env.NODE_ENV === 'production';

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (this.isProduction && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const prefix = `[Esports][${level.toUpperCase()}][${timestamp}]`;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

    switch (level) {
      case 'info':
        console.info(`${prefix} ${message}${contextStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}${contextStr}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}${contextStr}`);
        break;
      case 'debug':
        console.debug(`${prefix} ${message}${contextStr}`);
        break;
    }
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  /**
   * Specifically for normalization warnings (missing fields, etc.)
   */
  normalizationWarning(field: string, entity: string, id?: string | number) {
    this.warn(`Missing field '${field}' during normalization of ${entity}`, { id });
  }

  /**
   * Specifically for stale data detection
   */
  staleDataWarning(provider: string, ageMinutes: number) {
    this.warn(`Stale data detected from ${provider}`, { ageMinutes });
  }
}

export const esportsLogger = new EsportsLogger();
