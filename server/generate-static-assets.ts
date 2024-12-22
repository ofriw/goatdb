// @deno-types="https://deno.land/x/esbuild@v0.19.2/mod.d.ts"
import * as esbuild from 'esbuild';
import * as path from 'std/path/mod.ts';
import { getRepositoryPath } from '../base/development.ts';
import { VCurrent, VersionNumber } from '../base/version-number.ts';
import {
  ReBuildContext,
  isReBuildContext,
  ENTRY_POINTS,
  createOvvioImportPlugin,
  bundleResultFromBuildResult,
} from '../build.ts';
import {
  StaticAssets,
  compileAssetsDirectory,
  kEntryPointsNames,
  staticAssetsToJS,
} from '../net/server/static-assets.ts';
import { getGoatConfig } from './config.ts';

function generateConfigSnippet(
  version: VersionNumber,
  serverURL?: string,
  orgId?: string,
): string {
  const config = {
    ...getGoatConfig(),
    debug: true,
    version,
    orgId,
  };
  delete config.clientData;
  delete config.serverData;
  if (serverURL) {
    config.serverURL = serverURL;
  }
  return `;\n\self.OvvioConfig = ${JSON.stringify(config)};`;
}

export async function buildAssets(
  ctx: ReBuildContext | typeof esbuild,
  version: VersionNumber,
  serverURL?: string,
  orgId?: string,
): Promise<StaticAssets> {
  const buildResults = await (isReBuildContext(ctx)
    ? ctx.rebuild()
    : bundleResultFromBuildResult(
        await ctx.build({
          entryPoints: ENTRY_POINTS,
          plugins: [await createOvvioImportPlugin()],
          bundle: true,
          write: false,
          sourcemap: 'linked',
          outdir: 'output',
        }),
      ));

  const repoPath = await getRepositoryPath();
  const result = {} as StaticAssets;
  const textEncoder = new TextEncoder();
  for (const ep of kEntryPointsNames) {
    const { source, map } = buildResults[ep];
    const assets = await compileAssetsDirectory(
      path.join(repoPath, 'assets'),
      path.join(repoPath, ep, 'assets'),
    );
    assets['/app.js'] = {
      data: textEncoder.encode(
        generateConfigSnippet(version, serverURL, orgId) + source,
      ),
      contentType: 'text/javascript',
    };
    assets['/app.js.map'] = {
      data: textEncoder.encode(map),
      contentType: 'application/json',
    };
    try {
      assets['/index.html'] = {
        data: await Deno.readFile(path.join(repoPath, ep, 'src', 'index.html')),
        contentType: 'text/html',
      };
    } catch (_: unknown) {
      // ignore
    }
    try {
      assets['/index.css'] = {
        data: await Deno.readFile(path.join(repoPath, ep, 'src', 'index.css')),
        contentType: 'text/css',
      };
    } catch (_: unknown) {
      // ignore
    }
    result[ep] = assets;
  }
  return result;
}

export async function defaultAssetsBuild(): Promise<void> {
  const repoPath = await getRepositoryPath();
  await Deno.mkdir(path.join(repoPath, 'build'), { recursive: true });

  console.log('Bundling client code...');
  const assets = await buildAssets(esbuild, VCurrent);
  await Deno.writeTextFile(
    path.join(repoPath, 'build', 'staticAssets.json'),
    JSON.stringify(staticAssetsToJS(assets)),
  );
  esbuild.stop();
}

if (import.meta.main) {
  defaultAssetsBuild();
}
