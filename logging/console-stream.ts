import { NormalizedLogEntry, Severity, SeverityFromCode } from './entry.ts';
import { LogEntry, LogStream } from './log.ts';

export class ConsoleLogStream implements LogStream {
  severity: Severity;
  constructor(severity: Severity | number = 'DEFAULT') {
    this.severity = typeof severity === 'number'
      ? SeverityFromCode(severity)
      : severity;
  }

  appendEntry(e: NormalizedLogEntry<LogEntry>): void {
    let textLog = `[${new Date(e.timestamp).toISOString()}] `;
    if (typeof e.message === 'string') {
      textLog += e.message + ': ';
    }
    textLog += JSON.stringify(e, null, 2);
    switch (e.severity as Severity) {
      case 'EMERGENCY':
      case 'ALERT':
      case 'CRITICAL':
      case 'ERROR':
        console.error(textLog);
        throw new Error(textLog);

      case 'WARNING':
      case 'NOTICE':
        console.warn(textLog);
        break;

      case 'INFO':
      case 'DEFAULT':
        console.log(textLog);
        break;

      case 'DEBUG':
      case 'METRIC':
      case 'EVENT':
        console.debug(textLog);
        break;
    }
  }
}
