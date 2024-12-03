import * as path from 'std/path/mod.ts';
import { JSONCyclicalEncoder } from '../../base/core-types/encoding/json.ts';
import { assert } from '../../base/error.ts';
import { JSONLogFile } from '../../base/json-log.ts';
import { Commit } from '../../repo/commit.ts';
import { RepositoryPersistance } from './repo.ts';

export class JSONLogPersistance implements RepositoryPersistance {
  private readonly _commitIds: Set<string>;
  private _log: JSONLogFile | undefined;
  private _ready = false;

  constructor(
    readonly orgId: string,
    readonly repoPath: string,
    readonly processId: number,
  ) {
    this._commitIds = new Set();
  }

  get ready(): boolean {
    return this._ready;
  }

  get logFile(): JSONLogFile | undefined {
    return this._log;
  }

  async open(): Promise<AsyncGenerator<Commit[]>> {
    return await this._openImpl();
  }

  async close(): Promise<void> {
    if (this._log) {
      await this._log.close();
      this._log = undefined;
    }
  }

  private async *_openImpl(): AsyncGenerator<Commit[]> {
    const repoPath = this.repoPath;
    // First, make sure the repository dir exists
    Deno.mkdirSync(repoPath, { recursive: true });
    for await (const file of Deno.readDir(repoPath)) {
      const pid = processIdFromFileName(file.name);
      if (pid < 0 || pid === this.processId) {
        continue;
      }
      const logFile = new JSONLogFile(path.join(repoPath, file.name), false);
      for await (const buff of logFile.openAsync()) {
        const commitsArr: Commit[] = Commit.fromJSArr(this.orgId, buff);
        for (const commit of commitsArr) {
          this._commitIds.add(commit.id);
        }
        yield commitsArr;
      }
      logFile.close();
    }
    this._log = new JSONLogFile(
      path.join(repoPath, processIdToFileName(this.processId)),
      true,
    );
    for await (const buff of this._log.openAsync()) {
      const commitsArr: Commit[] = Commit.fromJSArr(this.orgId, buff);
      for (const commit of commitsArr) {
        this._commitIds.add(commit.id);
      }
      yield commitsArr;
    }
    this._ready = true;
  }

  async persistCommits(commits: Commit[]): Promise<number> {
    const log = this._log;
    assert(log !== undefined, 'Backup not opened yet');
    commits = commits.filter((c) => !this._commitIds.has(c.id));
    if (!commits.length) {
      return Promise.resolve(0);
    }
    await log.append(
      commits.map((c) => JSONCyclicalEncoder.serialize(c, true)),
    );
    return commits.length;
  }

  sync(): Promise<void> {
    return this._log?.barrier() || Promise.resolve();
  }
}

const FILE_PREFIX = 'p';
const FILE_SUFFIX = '.jsonl';
function processIdFromFileName(name: string): number {
  if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_SUFFIX)) {
    return -1;
  }
  return parseInt(
    name.substring(FILE_PREFIX.length, name.length - FILE_SUFFIX.length),
  );
}

function processIdToFileName(processId: number): string {
  return `${FILE_PREFIX}${processId}${FILE_SUFFIX}`;
}

// async function* loadCommitsFromJSONLog(
//   orgId: string,
//   log: JSONLogFile,
// ): AsyncGenerator<Commit[]> {
//   for await (const buff of await log.openAsync()) {
//     const commits = [];
//     for (const json of buff) {
//       commits.push(Commit.fromJS(orgId, json));
//     }
//     yield commits;
//     // try {
//     // yield Commit.fromJS(orgId, json);
//     // } catch (err: any) {
//     //   // Skip any bad commits
//     //   debugger;
//     // }
//   }
// }
