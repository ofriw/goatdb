import * as path from 'std/path/mod.ts';
import {
  EncodedRepoCache,
  QueryPersistanceStorage,
} from '../../repo/query-persistance.ts';
import { readTextFile, writeTextFile } from '../../base/json-log/json-log.ts';

export class QueryPersistenceFile implements QueryPersistanceStorage {
  constructor(readonly dir: string) {}

  async load(repoId: string): Promise<EncodedRepoCache | undefined> {
    // try {
    const text = await readTextFile(
      path.join(this.dir, repoId + '.cache.json'),
    );
    return text && JSON.parse(text);
    // } catch (_: unknown) {
    //   return undefined;
    // }
  }

  async store(repoId: string, value: EncodedRepoCache): Promise<boolean> {
    // try {
    const dst = path.join(this.dir, repoId + '.cache.json');
    // await Deno.mkdir(path.dirname(dst), { recursive: true });
    return await writeTextFile(dst, JSON.stringify(value));
    // return true;
    // } catch (_: unknown) {
    //   debugger;
    //   return false;
    // }
  }
}
