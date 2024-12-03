import { isDevelopmentBuild } from '../../base/development.ts';
import { ServerServices } from './server.ts';

export function getRequestPath<T extends string = string>(req: Request): T {
  return new URL(req.url).pathname.toLowerCase() as T;
}

export function getBaseURL(services: ServerServices): string {
  if (isDevelopmentBuild()) {
    return 'http://localhost:8080';
  }
  return `https://${services.organizationId}.ovvio.io`;
}
