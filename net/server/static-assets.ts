import { walk } from 'std/fs/walk.ts';
import { exists } from 'std/fs/mod.ts';
import { extname } from 'std/path/mod.ts';
import { Endpoint, ServerServices } from './server.ts';
import { getRequestPath } from './utils.ts';
import { JSONObject, ReadonlyJSONObject } from '../../base/interfaces.ts';
import { decodeBase64, encodeBase64 } from 'std/encoding/base64.ts';

const STATIC_ASSETS_CACHE_DURATION_SEC = 86400;

export const kEntryPointsNames = ['web-app', '__file_worker'] as const;
export type EntryPointName = (typeof kEntryPointsNames)[number];
export const EntryPointDefault: EntryPointName = 'web-app';

export const EntryPointIndex: Record<EntryPointName, string> = {
  'web-app': 'src/index.tsx',
  __file_worker: 'json-log.worker.ts',
};

export type ContentType =
  | 'image/svg+xml'
  | 'image/png'
  | 'image/jpeg'
  | 'image/jpeg'
  | 'application/json'
  | 'text/javascript'
  | 'text/html'
  | 'text/css'
  | 'application/wasm';

const ContentTypeMapping: Record<string, ContentType> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/javascript',
  html: 'text/html',
  css: 'text/css',
  wasm: 'application/wasm',
};

const kValidFileExtensions = Object.keys(ContentTypeMapping);

export interface Asset {
  data: Uint8Array;
  contentType: ContentType;
}

export type StaticEntryPoint = Record<string, Asset>;
export type StaticAssets = Required<Record<EntryPointName, StaticEntryPoint>>;

export class StaticAssetsEndpoint implements Endpoint {
  filter(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): boolean {
    return req.method === 'GET';
  }

  processRequest(
    services: ServerServices,
    req: Request,
    info: Deno.ServeHandlerInfo,
  ): Promise<Response> {
    let path = getRequestPath(req);

    const pathComps = path.split('/');

    let ep: EntryPointName = EntryPointDefault;
    if (kEntryPointsNames.includes(pathComps[1] as EntryPointName)) {
      ep = pathComps[1] as EntryPointName;
    }
    const staticEP = services.staticAssets && services.staticAssets[ep];

    if (!staticEP) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }

    const epRelativePath =
      ep === EntryPointDefault
        ? path
        : path.substring((ep as string).length + 1);

    const orgPathPrefix = `/org/${services.organizationId}/`;
    let asset =
      staticEP[`${orgPathPrefix}${epRelativePath.substring(1)}`] ||
      staticEP[epRelativePath];

    if (asset && epRelativePath === '/app.js') {
      const result: string[] = [];
      for (const p of Object.keys(staticEP)) {
        if (p.startsWith(orgPathPrefix)) {
          result.push(p.substring(orgPathPrefix.length - 1));
        }
      }
      result.sort();
      const snippet = `self.OvvioAssetsList = ${JSON.stringify(result)};\n`;
      return Promise.resolve(
        new Response(snippet + new TextDecoder().decode(asset.data), {
          headers: {
            'content-type': 'text/javascript',
          },
        }),
      );
    }

    // Default to index page
    if (!asset) {
      asset = staticEP['/index.html'];
    }

    // 404 if we don't have an index
    if (!asset) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }

    const headers: Record<string, string> = {
      'content-type': asset.contentType,
    };
    if (asset.contentType.startsWith('image/')) {
      headers[
        'cache-control'
      ] = `Cache-Control: public, max-age=${STATIC_ASSETS_CACHE_DURATION_SEC}`;
    }
    return Promise.resolve(
      new Response(asset.data, {
        headers,
      }),
    );
  }
}

export async function compileAssetsDirectory(
  ...assetsDirectories: string[]
): Promise<Record<string, Asset>> {
  const result: Record<string, Asset> = {};
  for (const dir of assetsDirectories) {
    if (!(await exists(dir))) {
      continue;
    }
    for await (const { path } of walk(dir, {
      includeDirs: false,
      includeSymlinks: false,
      followSymlinks: false,
      exts: kValidFileExtensions,
    })) {
      const origExt = extname(path);
      let ext = origExt.substring(1);
      if (ext === 'ts') {
        ext = 'js';
      }
      let key = path.substring(dir.length).toLowerCase();
      // Rewrite extension to match
      key = key.substring(0, key.length - origExt.length) + '.' + ext;
      result[key] = {
        data: await Deno.readFile(path),
        contentType: ContentTypeMapping[ext] || 'application/octet-stream',
      };
    }
  }
  return result;
}

export function staticAssetsToJS(assets: StaticAssets): ReadonlyJSONObject {
  const result: JSONObject = {};
  for (const [ep, entry] of Object.entries(assets)) {
    const encodedEp: JSONObject = {};
    for (const [path, asset] of Object.entries(entry)) {
      encodedEp[path] = {
        data: encodeBase64(asset.data),
        contentType: asset.contentType,
      };
    }
    result[ep] = encodedEp;
  }
  return result;
}

export function staticAssetsFromJS(assets: ReadonlyJSONObject): StaticAssets {
  const result: Record<string, StaticEntryPoint> = {};
  for (const [ep, encodedEp] of Object.entries(assets)) {
    const entry: StaticEntryPoint = {};
    for (const [path, asset] of Object.entries(
      encodedEp as ReadonlyJSONObject,
    )) {
      entry[path] = {
        data: decodeBase64((asset as ReadonlyJSONObject).data as string),
        contentType: (asset as ReadonlyJSONObject).contentType as ContentType,
      };
    }
    result[ep] = entry;
  }
  return result as StaticAssets;
}
