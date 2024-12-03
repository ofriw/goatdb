import { LogStream, log } from '../../logging/log.ts';
import { ServerServices, Endpoint, Middleware } from './server.ts';
import { getRequestPath } from './utils.ts';

export class MetricsMiddleware implements Middleware {
  constructor(readonly outputStreams?: readonly LogStream[]) {}

  didProcess(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
    resp: Response,
  ): Promise<Response> {
    log(
      {
        severity: 'METRIC',
        name: 'HttpStatusCode',
        unit: 'Count',
        value: resp.status,
        url: req.url,
        method: req.method,
        orgId: services.organizationId,
      },
      this.outputStreams,
    );
    return Promise.resolve(resp);
  }
}

export class PrometheusMetricsEndpoint implements Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): boolean {
    if (req.method !== 'GET') {
      return false;
    }
    return getRequestPath(req) === '/metrics';
  }

  processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    const logStream = services.prometheusLogStream;
    const metrics = logStream.getMetrics();
    return Promise.resolve(
      new Response(metrics, {
        headers: {
          'content-type': 'text/plain; version=0.0.4; charset=utf-8',
        },
      }),
    );
  }
}
