import { Commit } from '../../repo/commit.ts';

export interface RepositoryPersistance {
  open(): Promise<AsyncGenerator<Commit[]>>;
  persistCommits(commits: Iterable<Commit>): Promise<number>;
  close(): Promise<void>;
  sync(): Promise<void>;
}
