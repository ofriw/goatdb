import React, {
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { GoatDB, type DBConfig } from '../db/db.ts';
import { Schema } from '../cfds/base/schema.ts';
import { ManagedItem } from '../db/managed-item.ts';
import { MutationPack, mutationPackHasField } from '../db/mutations.ts';
import { ReadonlyJSONValue } from '../base/interfaces.ts';
import { Query, QueryConfig } from '../repo/query.ts';
import { getBaseURL } from '../net/rest-api.ts';

type GoatDBCtxProps = {
  db?: GoatDB;
};

const GoatDBContext = React.createContext<GoatDBCtxProps>({});

/**
 * Opens a local DB, creating it if necessary. Once opened, the DB is available
 * as a react context. All future calls return the already opened DB rather than
 * opening it again.
 *
 * @returns A DB instance.
 */
export function useDB(): GoatDB {
  const ctx = useContext(GoatDBContext);
  if (!ctx.db) {
    ctx.db = new GoatDB({ path: '/data/db', peers: getBaseURL() });
  }
  return ctx.db;
}

export type UseItemOpts = {
  keys?: string | string[];
};

export function useItem<S extends Schema>(
  opts: UseItemOpts,
  ...pathCompsOrOpts: string[]
): ManagedItem<S>;

export function useItem<S extends Schema>(
  path: string,
  opts: UseItemOpts,
): ManagedItem<S>;

export function useItem<S extends Schema>(
  ...pathCompsOrOpts: string[]
): ManagedItem<S>;

export function useItem<S extends Schema>(
  ...pathCompsOrOpts: (string | UseItemOpts)[]
): ManagedItem<S> {
  const db = useDB();
  let change = 0;
  const [_, setRenderCount] = useState(change);
  // Options object may appear either at the beginning or at the end
  const opts =
    typeof pathCompsOrOpts[0] !== 'string'
      ? (pathCompsOrOpts[0] as UseItemOpts)
      : typeof pathCompsOrOpts[pathCompsOrOpts.length - 1] !== 'string'
      ? (pathCompsOrOpts[pathCompsOrOpts.length - 1] as UseItemOpts)
      : undefined;
  const item = db.item<S>(...(pathCompsOrOpts as string[]));
  useEffect(
    () =>
      item.attach('change', (mutations: MutationPack) => {
        // Skip unneeded updates if a specific set of keys was provided
        if (opts?.keys !== undefined) {
          if (typeof opts.keys === 'string') {
            if (!mutationPackHasField(mutations, opts.keys)) {
              return;
            }
          } else if (!mutationPackHasField(mutations, ...opts.keys)) {
            return;
          }
        }
        setRenderCount(++change);
      }),
    [item],
  );
  return item;
}

export interface UseQueryOpts<
  IS extends Schema,
  CTX extends ReadonlyJSONValue,
  OS extends IS = IS,
> extends Omit<QueryConfig<IS, OS, CTX>, 'db'> {
  showIntermittentResults?: boolean;
}

export function useQuery<
  IS extends Schema,
  CTX extends ReadonlyJSONValue,
  OS extends IS = IS,
>(config: UseQueryOpts<IS, CTX, OS>): Query<IS, OS, CTX> {
  const db = useDB();
  const query = db.query(config);
  const subscribe = useCallback(
    (onStoreChange: () => void) => query.onResultsChanged(onStoreChange),
    [query],
  );
  const getSnapshot = useCallback(() => query.results(), [query]);
  useSyncExternalStore(subscribe, getSnapshot);
  return query;
}

export type DBReadyState = 'loading' | 'ready' | 'error';

export function useDBReady(): DBReadyState {
  const db = useDB();
  let error = false;
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!db.ready) {
        let cancelled = false;
        db.readyPromise()
          .then(() => {
            if (!cancelled) {
              onStoreChange();
            }
          })
          .catch(() => {
            error = true;
            if (!cancelled) {
              onStoreChange();
            }
          });
        return () => {
          cancelled = true;
        };
      }
      return () => {};
    },
    [db],
  );
  const getSnapshot = useCallback(() => {
    if (error) {
      return 'error';
    }
    return db.ready ? 'ready' : 'loading';
  }, [db]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
