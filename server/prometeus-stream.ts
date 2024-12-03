import * as promClient from 'https://deno.land/x/ts_prometheus@v0.3.0/mod.ts';
import { BaseLogEntry, NormalizedLogEntry } from '../logging/entry.ts';
import { LogStream } from '../logging/log.ts';
import {
  ServerMetricName,
  MetricType,
  MetricName,
  kServerMetricNames,
  logEntryIsMetric,
} from '../logging/metrics.ts';
import { notReached } from '../base/error.ts';

export const kMetricTypes: Record<ServerMetricName, MetricType> = {
  PeerResponseTime: 'Count',
  CommitsPersistTime: 'Count',
  CommitsPersistCount: 'Count',
  DeltaFormatSavings: 'Histogram',
  ServerStarted: 'Count',
  HttpStatusCode: 'Count',
  IncompatibleProtocolVersion: 'Count',
  InternalServerError: 'Count',
  EmailSent: 'Count',
  OperatorLogsQuery: 'Count',
  DBError: 'Count',
};

export class PrometheusLogStream implements LogStream {
  private myRegistry = new promClient.Registry();
  private metrics: Record<MetricName, promClient.Metric>;

  constructor() {
    this.metrics = {} as Record<MetricName, promClient.Metric>;
    const serverMetricNames = kServerMetricNames;

    for (const metricName of serverMetricNames) {
      const metricType = kMetricTypes[metricName];

      switch (metricType) {
        case 'Count':
          this.metrics[metricName] = promClient.Counter.with({
            name: `ovvio_server_${metricName.toLowerCase()}_seconds`,
            help: `${metricName} metric in seconds`,
            labels: ['method', 'status'],
            registry: [this.myRegistry],
          });
          break;
        case 'Gauge':
          this.metrics[metricName] = promClient.Gauge.with({
            name: `ovvio_server_${metricName.toLowerCase()}_seconds`,
            help: `${metricName} metric in seconds`,
            registry: [this.myRegistry],
          });
          break;
        case 'Histogram':
          this.metrics[metricName] = promClient.Histogram.with({
            name: `ovvio_server_${metricName.toLowerCase()}_total`,
            help: `Total count of ${metricName} metric`,
            registry: [this.myRegistry],
            buckets: [],
          });
          break;
        case 'Summary':
          this.metrics[metricName] = promClient.Summary.with({
            name: `ovvio_server_${metricName.toLowerCase()}_savings`,
            help: `Summary of ${metricName} metric for savings`,
            registry: [this.myRegistry],
          });
          break;
        default:
          notReached(
            `Unsupported metric type for ${metricName}: ${metricType}`
          );
          break;
      }
    }
  }

  getMetrics(): string {
    return this.myRegistry.metrics();
  }

  appendEntry<T extends BaseLogEntry>(e: NormalizedLogEntry<T>): void {
    if (logEntryIsMetric(e)) {
      // if (isServerMetric(e)) {
      const metricName = e.name;
      const metricType = kMetricTypes[metricName as ServerMetricName];

      if (this.metrics[metricName]) {
        switch (metricType) {
          case 'Count':
            if (e.value !== undefined) {
              (this.metrics[metricName] as promClient.Counter).inc(e.value);
            }
            break;
          case 'Gauge':
            if (e.value !== undefined) {
              (this.metrics[metricName] as promClient.Gauge).set(e.value);
            }
            break;
          case 'Histogram':
            if (e.value !== undefined) {
              (this.metrics[metricName] as promClient.Histogram).observe(
                e.value
              );
            }
            break;
          case 'Summary':
            if (e.value !== undefined) {
              (this.metrics[metricName] as promClient.Summary).observe(e.value);
            }
            break;
          default:
            // Handle unsupported metric types
            notReached(
              `Unsupported metric type for ${metricName}: ${metricType}`
            );
            break;
        }
      }
    }
  }
  // }
}
