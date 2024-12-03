import { Server } from '../net/server/server.ts';
import { staticAssetsFromJS } from '../net/server/static-assets.ts';
import encodedStaticAsses from '../build/staticAssets.json' assert { type: 'json' };
import buildInfo from '../build/build-info.json' assert { type: 'json' };

async function main(): Promise<void> {
  const staticAssets = staticAssetsFromJS(encodedStaticAsses);
  const server = new Server(undefined, staticAssets, buildInfo);
  await server.setup();
  await server.start();
}

main();
