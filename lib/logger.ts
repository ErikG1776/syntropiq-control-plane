/**
 * Structured logging framework for Syntropiq Control Plane.
 *
 * Emits JSON-formatted log lines with consistent fields:
 *   - level, message, timestamp, service, component, traceId, ...extra
 *
 * Levels: debug < info < warn < error
 * Configurable via LOG_LEVEL env var (default: "info").
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  service: string
  component?: string
  traceId?: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  child(component: string): Logger
}

const SERVICE_NAME = "syntropiq-control-plane"

function getMinLevel(): LogLevel {
  if (typeof process !== "undefined" && process.env?.LOG_LEVEL) {
    const lvl = process.env.LOG_LEVEL.toLowerCase()
    if (lvl in LEVEL_ORDER) return lvl as LogLevel
  }
  return "info"
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getMinLevel()]
}

function emit(entry: LogEntry): void {
  if (!shouldLog(entry.level)) return

  const line = JSON.stringify(entry)

  switch (entry.level) {
    case "debug":
      console.debug(line)
      break
    case "warn":
      console.warn(line)
      break
    case "error":
      console.error(line)
      break
    default:
      console.log(line)
  }
}

let traceCounter = 0

/** Generate a lightweight trace ID for correlating log entries. */
export function generateTraceId(): string {
  traceCounter += 1
  const ts = Date.now().toString(36)
  const seq = traceCounter.toString(36).padStart(4, "0")
  return `tr_${ts}_${seq}`
}

function createLogger(component?: string, traceId?: string): Logger {
  function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      ...(component && { component }),
      ...(traceId && { traceId }),
      ...extra,
    }
    emit(entry)
  }

  return {
    debug: (msg, extra) => log("debug", msg, extra),
    info: (msg, extra) => log("info", msg, extra),
    warn: (msg, extra) => log("warn", msg, extra),
    error: (msg, extra) => log("error", msg, extra),
    child: (childComponent: string) =>
      createLogger(
        component ? `${component}.${childComponent}` : childComponent,
        traceId,
      ),
  }
}

/** Root logger instance. */
export const logger = createLogger()

/** Create a scoped logger for a specific component. */
export function createComponentLogger(component: string, traceId?: string): Logger {
  return createLogger(component, traceId)
}
