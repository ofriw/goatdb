import * as path from 'std/path/mod.ts';

export function getEntryFilePath(): string {
  return path.fromFileUrl(import.meta.url);
}

export async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch (_: unknown) {
    return false;
  }
}

export async function getRepositoryPath(): Promise<string> {
  let candidate = path.dirname(getEntryFilePath());
  while (!(await dirExists(path.join(candidate, '.git')))) {
    candidate = path.dirname(candidate);
  }
  return candidate;
}

export async function getImportMapPath(): Promise<string> {
  return path.join(await getRepositoryPath(), 'import-map.json');
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (Deno.build.os === 'darwin') {
      const process = new Deno.Command('pbcopy', {
        stdin: 'piped',
      }).spawn();
      const encoder = new TextEncoder();
      const writer = process.stdin.getWriter();
      await writer.write(encoder.encode(value));
      // await writer.write(encoder.encode('\u0004'));
      await writer.close();
      // await process.stdin.close();
      await process.output();
      return true;
    }
    if (Deno.build.os === 'windows') {
      console.log(`Copy:\n\n${value}\n`);
      return true;
    }
  } catch (_err: unknown) {
    debugger;
  }
  return false;
}

export function isDevelopmentBuild(): boolean {
  return Deno.build.os === 'darwin' || Deno.build.os === 'windows';
}
