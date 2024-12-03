import {
  LogEntryDeveloperError,
  OperationalErrorLogEntry,
  SystemErrorLogEntry,
} from './errors.ts';
import {
  GenericLogEntry,
  NormalizedLogEntry,
  normalizeLogEntry,
  Severity,
  SeverityCodes,
} from './entry.ts';
import { MetricLogEntry } from './metrics.ts';
import { ClientEventEntry } from './client-events.ts';
import { ConsoleLogStream } from './console-stream.ts';

/**
 * A union type of all possible log entries.
 */
export type LogEntry =
  | GenericLogEntry
  | LogEntryDeveloperError
  | OperationalErrorLogEntry
  | SystemErrorLogEntry
  | MetricLogEntry
  | ClientEventEntry;

export interface LogStream {
  appendEntry(e: NormalizedLogEntry<LogEntry>): void;
}

// TODO: Capture anonymous logs on client and sync them with the server
const kDefaultLoggerStreams: LogStream[] = [new ConsoleLogStream()];

let gLogStreams: readonly LogStream[] = kDefaultLoggerStreams;

let gLogLevel = SeverityCodes.DEFAULT;

export function setGlobalLoggerStreams(streams: readonly LogStream[]): void {
  gLogStreams = streams;
}

export function resetGlobalLoggerStreams(): void {
  gLogStreams = kDefaultLoggerStreams;
}

export function setGlobalLoggerSeverity(level: Severity): void {
  gLogLevel = SeverityCodes[level];
}

export function log(
  entry: LogEntry,
  outputStreams: readonly LogStream[] | undefined = gLogStreams
): void {
  if (!outputStreams) {
    outputStreams = gLogStreams;
  }
  if (SeverityCodes[entry.severity] >= gLogLevel) {
    const e = normalizeLogEntry(entry);
    for (const stream of outputStreams) {
      stream.appendEntry(e);
    }
  }
}

export interface Logger {
  log(entry: LogEntry): void;
}

export function newLogger(outputStreams: LogStream[]): Logger {
  return {
    log(entry: LogEntry): void {
      log(entry, outputStreams);
    },
  };
}

export const GlobalLogger = {
  log(entry: LogEntry): void {
    log(entry, gLogStreams);
  },
};
