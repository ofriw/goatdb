import { ReadonlyJSONObject } from '../base/interfaces.ts';

export type BuildChannel = 'alpha' | 'beta' | 'release';

export interface BuildInfo extends ReadonlyJSONObject {
  creationDate: string;
  creator: string;
  builder: typeof Deno.build;
  channel: BuildChannel;
}

export function generateBuildInfo(channel: BuildChannel = 'alpha'): BuildInfo {
  const creator = new TextDecoder()
    .decode(
      new Deno.Command('whoami', {
        stdout: 'piped',
      }).outputSync().stdout,
    )
    .trim();

  return {
    creationDate: new Date().toISOString(),
    creator,
    builder: Deno.build,
    channel,
  };
}
