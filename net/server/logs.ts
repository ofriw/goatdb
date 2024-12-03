import { Endpoint, ServerServices } from './server.ts';
import { getRequestPath } from './utils.ts';
import { requireSignedUser } from './auth.ts';
import { accessDenied } from '../../cfds/base/errors.ts';

export class LogsEndpoint implements Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo
  ): boolean {
    if (req.method !== 'POST') {
      return false;
    }
    const path = getRequestPath(req);
    return path === '/logs/query';
  }

  async processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo
  ): Promise<Response> {
    if (!req.body) {
      return Promise.resolve(
        new Response(null, {
          status: 400,
        })
      );
    }

    const reqJson = await req.json();
    const [userId, userRecord, userSession] = await requireSignedUser(
      services,
      req,
      'operator'
    );
    const db = services.sqliteLogStream.db;
    const query = reqJson.query;
    services.logger.log({
      severity: 'METRIC',
      name: 'OperatorLogsQuery',
      value: 1,
      unit: 'Count',
      operator: userRecord?.get<string>('email') || userId,
      session: userSession.id,
      query,
    });
    const statement = db.prepare(query);
    if (!statement.readonly) {
      throw accessDenied();
    }
    const results = statement.all();
    return new Response(JSON.stringify(results), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }
}
