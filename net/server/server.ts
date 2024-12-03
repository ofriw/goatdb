import yargs from 'yargs';
import * as path from 'std/path/mod.ts';
import { decodeBase64Url } from 'std/encoding/base64url.ts';
import { Dictionary } from '../../base/collections/dict.ts';
import {
  log,
  Logger,
  LogStream,
  newLogger,
  setGlobalLoggerStreams,
} from '../../logging/log.ts';
import { HTTPMethod } from '../../logging/metrics.ts';
import { PrometheusLogStream } from '../../server/prometeus-stream.ts';
// import { SyncEndpoint, SyncService } from './sync.ts';
import { StaticAssets, StaticAssetsEndpoint } from './static-assets.ts';
import { ConsoleLogStream } from '../../logging/console-stream.ts';
// import { AuthEndpoint } from './auth.ts';
import { HealthCheckEndpoint } from './health.ts';
import { MetricsMiddleware, PrometheusMetricsEndpoint } from './metrics.ts';
import { SettingsService } from './settings.ts';
import { BaseService } from './service.ts';
import { TrustPool } from '../../db/session.ts';
import { EmailService } from './email.ts';
import { CORSEndpoint, CORSMiddleware } from './cors.ts';
import { ServerError } from '../../cfds/base/errors.ts';
// import { LogsEndpoint } from './logs.ts';
import { sleep } from '../../base/time.ts';
import { kSecondMs } from '../../base/date.ts';
// import { JSONLogStream } from '../../logging/json-log-stream.ts';
import { getOvvioConfig } from '../../server/config.ts';
import { organizationIdFromURL } from '../rest-api.ts';
import { VCurrent } from '../../base/version-number.ts';
import { tuple4ToString } from '../../base/tuple.ts';
import { BuildInfo, generateBuildInfo } from '../../server/build-info.ts';
import { prettyJSON } from '../../base/common.ts';
import { GoatDB } from '../../db/db.ts';
// import { StatsEndpoint } from './stats.ts';
// import {
//   BenchmarkResults,
//   runBenchmarks,
//   runInsertBenchmark,
// } from './benchmark.ts';

export const ENV_REPLICAS = 'REPLICAS';

interface BaseServerContext {
  // Full path to data directory
  readonly dir: string;
  readonly replicas: string[];
  readonly port: number;
  readonly silent?: boolean;
  readonly sesRegion?: string;
  readonly serverProcessIndex: number;
  readonly serverProcessCount: number;
}

/**
 * CLI arguments consumed by our server.
 */
interface Arguments extends BaseServerContext {
  readonly b64replicas?: string;
  readonly pool?: string;
  readonly version?: boolean;
}

// Stuff that's shared to all organizations served by this server
export interface ServerContext extends BaseServerContext {
  readonly settings: SettingsService;
  // readonly prometheusLogStream: PrometheusLogStream;
  // readonly sqliteLogStream: SQLiteLogStream;
  readonly trustPool: TrustPool;
  // readonly email: EmailService;
  readonly logger: Logger;
  staticAssets: StaticAssets | undefined;
}

// Stuff specific to an organization
export interface ServerServices extends ServerContext {
  readonly organizationId: string;
  readonly db: GoatDB;
  // readonly sync: SyncService;
}

/**
 * An Endpoint catches a request using its filter, and generates an appropriate
 * response for the request. For every incoming request, all Endpoints are
 * searched until the first filter hit is found. Thus, the order of Endpoint
 * registration determines the search order.
 *
 * In order to fulfill their job, Endpoints can consume Services offered by the
 * server. See `BaseService` below.
 */
export interface Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): boolean;
  processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response>;
}

/**
 * A middleware runs before and/or after the selected endpoint. A middleware
 * may either block the request entirely (to enforce permissions, etc) or modify
 * the response after the endpoint finished execution.
 *
 * Note that all registered middlewares get a chance to run for each request.
 * Execution order follows registration order, just like endpoints.
 */
export interface Middleware {
  shouldProcess?: (
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ) => Promise<Response | undefined>;
  didProcess?: (
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
    resp: Response,
  ) => Promise<Response>;
}

/**
 * A simple abstraction around an HTTP server. Our server is built using two
 * primitives: endpoints and middlewares.
 *
 * Endpoint:
 * ---------
 *
 * An endpoint catches a request using its filter, and generates an appropriate
 * response for this request. For every incoming request, all endpoints are
 * searched until a first filter hit is found. Thus, the order of endpoint
 * registration determines the search order.
 *
 * Middleware:
 * -----------
 *
 * A middleware runs before and/or after the selected endpoint. A middleware
 * may either block the request entirely (to enforce permissions, etc) or modify
 * the response after the endpoint finished execution.
 *
 * Note that all registered middlewares get a chance to run for each request.
 * Execution order follows registration order, like endpoints.
 */
export class Server {
  private readonly _endpoints: Endpoint[];
  private readonly _middlewares: Middleware[];
  private readonly _baseContext: ServerContext;
  private readonly _servicesByOrg: Dictionary<string, ServerServices>;
  private _abortController: AbortController | undefined;
  private _httpServer?: Deno.HttpServer;

  constructor(
    args?: Arguments,
    staticAssets?: StaticAssets,
    buildInfo?: BuildInfo,
    readonly remapLocalhost?: string,
  ) {
    this._endpoints = [];
    this._middlewares = [];
    getOvvioConfig().serverData = this;
    if (args === undefined) {
      args = yargs(Deno.args)
        .option('port', {
          alias: 'p',
          type: 'number',
          description: 'The port on which the server accepts incoming requests',
          default: 8080,
        })
        .option('replicas', {
          alias: 'r',
          type: 'array',
          default: [],
          description:
            'A list of replica URLs which this server will sync with',
        })
        .option('b64replicas', {
          alias: 'r64',
          type: 'string',
          default: [],
          description: 'A base64 url encoded JSON array of replicas',
        })
        .option('silent', {
          type: 'boolean',
          default: true,
          description: 'Disables metric logging to stdout',
        })
        .option('dir', {
          alias: 'd',
          description:
            'A full path to a local directory which will host all repositories managed by this server',
          default: '~/ovvio-data',
        })
        .option('sesRegion', {
          description:
            'An AWS region to use for sending emails with SES. Defaults to us-east-1.',
        })
        .option('pool', {
          description: 'Process pool configuration in the form of "idx:count".',
        })
        // .option('version', {
        //   description: 'Display version information about this build',
        // })
        .version(
          `Ovvio Server Version ${tuple4ToString(
            VCurrent,
          )}\nBuild Info:\n${prettyJSON(buildInfo || generateBuildInfo())}`,
        )
        .demandOption(
          ['dir'],
          // 'Please provide a local directory for this server'
        )
        // .demandOption(['app'], 'Please provide')
        .parse();
    }

    const [serverProcessIndex, serverProcessCount] = parsePoolConfig(
      args?.pool,
    );
    const dir = args!.dir;
    this._servicesByOrg = new Map();
    const settingsService = new SettingsService();
    const prometeusLogStream = new PrometheusLogStream();
    const logStreams: LogStream[] = [
      // new JSONLogStream(path.join(dir, `log-${serverProcessIndex}.jsonl`)),
      // prometeusLogStream,
    ];
    if (args?.silent !== true) {
      logStreams.splice(0, 0, new ConsoleLogStream());
    }
    setGlobalLoggerStreams(logStreams);
    const sesRegion = args?.sesRegion || 'us-east-1';
    let replicas: string[] | undefined;
    if (args?.b64replicas?.length || 0 > 0) {
      const decoder = new TextDecoder();
      replicas = JSON.parse(
        decoder.decode(decodeBase64Url(args?.b64replicas!)),
      );
    }
    const port =
      serverProcessCount > 1 ? 9000 + serverProcessIndex : args?.port || 8080;
    // const envReplicasStr = Deno.env.get(ENV_REPLICAS);
    // const envReplicas = envReplicasStr &&
    //   JSON.parse(decoder.decode(decodeBase64Url(envReplicasStr)));
    this._baseContext = {
      settings: settingsService,
      // trustPool: new TrustPool(settingsService.session, []),
      prometheusLogStream: prometeusLogStream,
      // sqliteLogStream,
      dir,
      replicas: replicas || args?.replicas || [],
      port,
      serverProcessIndex,
      serverProcessCount,
      email: new EmailService(sesRegion),
      logger: newLogger(logStreams),
      silent: args?.silent === true,
      staticAssets,
      sesRegion,
    } as ServerContext;
    // Monitoring
    this.registerMiddleware(new MetricsMiddleware(logStreams));
    this.registerEndpoint(new PrometheusMetricsEndpoint());
    // Health check
    this.registerEndpoint(new HealthCheckEndpoint());
    // Auth
    // this.registerEndpoint(new AuthEndpoint());
    // Stats
    // this.registerEndpoint(new StatsEndpoint());
    // Sync
    // this.registerEndpoint(new SyncEndpoint());
    // CORS Support
    this.registerMiddleware(new CORSMiddleware());
    this.registerEndpoint(new CORSEndpoint());
    // Static Assets
    this.registerEndpoint(new StaticAssetsEndpoint());
    // Logs
    // this.registerEndpoint(new LogsEndpoint());
  }

  async setup(): Promise<void> {
    const services: ServerServices = {
      ...this._baseContext,
      organizationId: '<global>',
      // sync: new SyncService(),
    };
    // Setup Settings service
    await this._baseContext.settings.setup(services);
    await this._baseContext.settings.start();
    await this._baseContext.email.setup(services);
    await this._baseContext.settings.start();
    (this._baseContext as any).trustPool = new TrustPool(
      'localhost',
      this._baseContext.settings.session,
      [],
    );
  }

  async servicesForOrganization(orgId: string): Promise<ServerServices> {
    let services = this._servicesByOrg.get(orgId);
    if (!services) {
      const baseTrustPool = this._baseContext.trustPool;
      // Monitoring
      services = {
        ...this._baseContext,
        dir: path.join(this._baseContext.dir, orgId),
        organizationId: orgId,
        // sync: new SyncService(),
        trustPool: new TrustPool(
          orgId,
          baseTrustPool.currentSession,
          baseTrustPool.roots,
        ),
      };

      // Setup all services in the correct order of dependencies
      // services.sync.setup(services);
      // <<< Add any new service.setup() calls here >>>
      this._servicesByOrg.set(orgId, services);
    }
    return services;
  }

  registerEndpoint(ep: Endpoint): void {
    this._endpoints.push(ep as Endpoint);
  }

  registerMiddleware(mid: Middleware): void {
    this._middlewares.push(mid as Middleware);
  }

  async processRequest(
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    if (req.url === 'http://AWSALB/healthy') {
      return new Response(null, { status: 200 });
    }
    let orgId = req.headers.get('x-org-id') || organizationIdFromURL(req.url);

    if (!orgId) {
      log({
        severity: 'METRIC',
        name: 'HttpStatusCode',
        unit: 'Count',
        value: 404,
        url: req.url,
        method: req.method as HTTPMethod,
        message: `Organization ID not found. Hostname: ${
          new URL(req.url).hostname
        }`,
      });
      return new Response(null, {
        status: 404,
      });
    }

    if (orgId === 'localhost' && this.remapLocalhost) {
      orgId = this.remapLocalhost;
    }
    const services = await this.servicesForOrganization(orgId);
    const middlewares = this._middlewares;
    for (const endpoint of this._endpoints) {
      if (endpoint.filter(services, req, info) === true) {
        try {
          let resp: Response | undefined;
          for (const m of middlewares) {
            if (m.shouldProcess) {
              resp = await m.shouldProcess(services, req, info);
              if (resp) {
                break;
              }
            }
          }
          if (!resp) {
            resp = await endpoint.processRequest(services, req, info);
          }
          for (const m of middlewares) {
            if (m.didProcess) {
              resp = await m.didProcess(services, req, info, resp);
            }
          }
          return resp;
        } catch (e: any) {
          if (e instanceof ServerError) {
            if (e.code === 500) debugger;
            log({
              severity: 'ERROR',
              name: 'HttpStatusCode',
              unit: 'Count',
              value: e.code,
              url: req.url,
              method: req.method as HTTPMethod,
              error: e.message,
              trace: e.stack,
              orgId,
            });
            return new Response(null, {
              status: e.code,
            });
          }
          debugger;
          log({
            severity: 'ERROR',
            name: 'InternalServerError',
            unit: 'Count',
            value: 500,
            url: req.url,
            method: req.method as HTTPMethod,
            error: String(e),
            trace: e.stack,
            orgId,
          });
          return new Response(null, {
            status: 500,
          });
        }
      }
    }
    let resp = new Response(null, {
      status: 404,
    });
    for (const m of middlewares) {
      if (m.didProcess) {
        resp = await m.didProcess(services, req, info, resp);
      }
    }
    return resp;
  }

  // async runBenchmark(): Promise<BenchmarkResults> {
  //   for (const services of this._servicesByOrg.values()) {
  //     for (const v of Object.values(services)) {
  //       if (v instanceof BaseService) {
  //         v.start();
  //       }
  //     }
  //   }
  //   const services = await this.servicesForOrganization('benchmark');
  //   const result = await runBenchmarks(services);
  //   for (const services of this._servicesByOrg.values()) {
  //     for (const v of Object.values(services)) {
  //       if (v instanceof BaseService) {
  //         v.stop();
  //       }
  //     }
  //   }
  //   return result;
  // }

  async start(): Promise<void> {
    if (this._abortController) {
      return Promise.resolve();
    }
    for (const services of this._servicesByOrg.values()) {
      for (const v of Object.values(services)) {
        if (v instanceof BaseService) {
          await v.start();
        }
      }
    }
    log({
      severity: 'METRIC',
      name: 'ServerStarted',
      value: 1,
      unit: 'Count',
      urls: this._baseContext.replicas,
    });
    let resolve: () => void;
    const result = new Promise<void>((res) => {
      resolve = res;
    });
    this._abortController = new AbortController();
    this._httpServer = Deno.serve(
      {
        port: this._baseContext.port,
        onListen() {
          resolve();
        },
        signal: this._abortController.signal,
      },
      this.processRequest.bind(this),
    );
    if (this._baseContext.silent === true) {
      console.log('STARTED');
    }
    sleep(kSecondMs).then(() => {
      console.log(`Replicas = ${this._baseContext?.replicas}`);
      console.log(`Remap localhost = ${this.remapLocalhost}`);
    });
    Deno.addSignalListener('SIGTERM', () => {
      Deno.exit(0);
    });
    return result;
  }
}

function parsePoolConfig(
  config: string | undefined,
): [idx: number, count: number] {
  if (!config) {
    return [0, 1];
  }
  const comps = config.split(':');
  if (comps.length !== 2) {
    return [0, 1];
  }
  const idx = parseInt(comps[0]);
  const count = parseInt(comps[1]);
  if (idx >= count || idx < 0 || count < 0) {
    return [0, 1];
  }
  return [idx, count];
}
