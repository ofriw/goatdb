import * as path from 'std/path/mod.ts';

export function toAbsolutePath(p: string): string {
  if (path.isAbsolute(p)) {
    return p;
  }
  return path.join(Deno.cwd(), p);
}
