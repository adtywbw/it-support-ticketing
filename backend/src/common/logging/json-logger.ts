import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { getCorrelationId } from "./request-context";

interface JsonLogEntry {
  timestamp: string;
  level: string;
  correlationId: string;
  context?: string;
  message: string;
  stack?: string;
}

/**
 * Structured JSON logger for NestJS.
 *
 * Outputs every log line as a JSON object with correlation ID,
 * timestamp, level, and context — machine-parseable for log
 * aggregation tools (ELK, Datadog, Loki, etc.).
 *
 * Falls back to plain-text in non-TTY environments (Docker) but still
 * emits JSON fields so `docker logs` remains human-readable while
 * structured for downstream collectors.
 */
export class JsonLogger extends ConsoleLogger {
  private formatEntry(
    level: string,
    message: string,
    context?: string,
    stack?: string,
  ): string {
    const entry: JsonLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      correlationId: getCorrelationId(),
      context: context ?? this.context,
      message,
    };
    if (stack) entry.stack = stack;

    return JSON.stringify(entry);
  }

  log(message: unknown, context?: string): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);
    console.log(this.formatEntry("LOG", msg, context));
  }

  error(message: unknown, stackOrContext?: string, context?: string): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);
    let stack: string | undefined;
    let ctx: string | undefined;

    // NestJS Logger.error signature: error(message, stack?, context?)
    if (stackOrContext && context) {
      stack = stackOrContext;
      ctx = context;
    } else if (stackOrContext) {
      // Could be stack or context — heuristic: contains newline = stack
      if (stackOrContext.includes("\n")) {
        stack = stackOrContext;
      } else {
        ctx = stackOrContext;
      }
    }

    console.error(this.formatEntry("ERROR", msg, ctx ?? this.context, stack));
  }

  warn(message: unknown, context?: string): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);
    console.warn(this.formatEntry("WARN", msg, context));
  }

  debug(message: unknown, context?: string): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);
    console.debug(this.formatEntry("DEBUG", msg, context));
  }

  verbose(message: unknown, context?: string): void {
    const msg = typeof message === "string" ? message : JSON.stringify(message);
    console.log(this.formatEntry("VERBOSE", msg, context));
  }

  /**
   * Returns log levels based on environment.
   * Production: log, error, warn only.
   * Development: all levels.
   */
  static getLogLevels(): LogLevel[] {
    const nodeEnv = process.env.NODE_ENV ?? "development";
    if (nodeEnv === "production") {
      return ["log", "error", "warn"];
    }
    return ["log", "error", "warn", "debug", "verbose"];
  }
}
