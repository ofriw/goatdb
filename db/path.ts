import { Repository } from '../repo/repo.ts';

export type RepoType = string;

export enum ItemPathPart {
  Type = 0,
  Repository = 1,
  Item = 2,
  Embed = 3,
}

export function itemPath<T extends RepoType>(
  type: T,
  repo: string,
  item: string,
  embed?: string,
): string {
  return `/${type}/${repo}/${item}${embed ? '/' + embed : ''}`;
}

export function itemPathGetPart<T extends string>(
  path: string,
  part: ItemPathPart,
): T {
  let start = 0;
  if (path[start] === '/') {
    ++start;
  }
  for (let i = 0; i < part; ++i) {
    while (start < path.length && path[start] !== '/') {
      ++start;
    }
    if (path[start] === '/') {
      ++start;
    }
  }
  if (path[start] === '/') {
    ++start;
  }
  let end = start + 1;
  while (end < path.length && path[end] !== '/') {
    ++end;
  }
  return path.substring(start, end) as T;
}

export function itemPathGetRepoId(path: string): string {
  return Repository.path(
    itemPathGetPart(path, ItemPathPart.Type),
    itemPathGetPart(path, ItemPathPart.Repository),
  );
}

export function itemPathNormalize(path: string): string {
  let valid = true;
  if (path[0] === '/' && path[path.length - 1] !== '/') {
    let prevSep = -1;
    for (let i = 0; i < path.length; ++i) {
      if (path[i] === '/') {
        if (i - prevSep <= 0) {
          valid = false;
          break;
        }
        prevSep = i;
      }
    }
  }
  if (valid) {
    return path;
  }
  return itemPath(
    itemPathGetPart(path, ItemPathPart.Type),
    itemPathGetPart(path, ItemPathPart.Repository),
    itemPathGetPart(path, ItemPathPart.Item),
    itemPathGetPart(path, ItemPathPart.Embed),
  );
}

export function itemPathJoin(prefix: string, suffix: string): string {
  if (prefix.endsWith('/')) {
    prefix = prefix.substring(0, prefix.length - 1);
  }
  if (suffix[0] === '/') {
    suffix = suffix.substring(1);
  }
  return `${prefix}/${suffix}`;
}
