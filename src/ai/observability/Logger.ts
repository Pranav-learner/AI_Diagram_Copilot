/**
 * A minimal structured logger interface.
 *
 * The AI layer logs through this seam, never `console` directly, so the host app
 * can route logs to its own sink (and tests can assert on them). Ships a noop
 * default (silent by default — infra shouldn't spam) and a console adapter.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  log(level: LogLevel, message: string, fields?: LogFields): void;
  /** Derive a logger that attaches `fields` to every entry (e.g. a request id). */
  child(fields: LogFields): Logger;
}

class BaseLogger implements Logger {
  constructor(
    private readonly sink: (level: LogLevel, message: string, fields: LogFields) => void,
    private readonly bound: LogFields = {},
  ) {}

  log(level: LogLevel, message: string, fields: LogFields = {}): void {
    this.sink(level, message, { ...this.bound, ...fields });
  }

  child(fields: LogFields): Logger {
    return new BaseLogger(this.sink, { ...this.bound, ...fields });
  }
}

/** A logger that discards everything. The default. */
export const noopLogger: Logger = new BaseLogger(() => {});

/** A logger that writes to the console. Opt-in. */
export const consoleLogger: Logger = new BaseLogger((level, message, fields) => {
  const line = `[ai:${level}] ${message}`;
  const args = Object.keys(fields).length ? [line, fields] : [line];
  if (level === 'error') console.error(...args);
  else if (level === 'warn') console.warn(...args);
  else console.log(...args);
});

/** Build a logger from a raw sink function. */
export function createLogger(sink: (level: LogLevel, message: string, fields: LogFields) => void): Logger {
  return new BaseLogger(sink);
}
