interface MapOptions {
  ttl: number;
  autoRefresh: boolean;
}

interface MapValue<V> {
  value: V;
  timeout: number;
}

const DEFAULTS = {
  ttl: 5 * 60 * 1000,
  autoRefresh: true,
};

export class CacheMap<K, V> {
  private _opts: MapOptions;
  private _map: Map<K, MapValue<V>>;

  constructor(opts?: MapOptions) {
    this._opts = {
      ...DEFAULTS,
      ...opts,
    };
    this._map = new Map<K, MapValue<V>>();
  }

  get(key: K): V | undefined {
    const val = this._map.get(key);
    if (!val) {
      return;
    }
    if (this._opts.autoRefresh) {
      clearTimeout(val.timeout);
      val.timeout = setTimeout(() => {
        this.delete(key);
      }, this._opts.ttl);
    }

    return val.value;
  }

  set(key: K, value: V): void {
    const oldVal = this._map.get(key);
    if (oldVal) {
      clearTimeout(oldVal.timeout);
    }
    const timeout = setTimeout(() => {
      this.delete(key);
    }, this._opts.ttl);
    this._map.set(key, {
      value,
      timeout,
    });
  }

  delete(key: K) {
    const oldVal = this._map.get(key);
    if (oldVal) {
      clearTimeout(oldVal.timeout);
    }
    return this._map.delete(key);
  }

  has(key: K): boolean {
    return this._map.has(key);
  }
}

export function memoize(fn: (...args: any[]) => any, opts?: MapOptions) {
  const cache = new CacheMap(opts);

  return function (...args: any[]): any {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}
