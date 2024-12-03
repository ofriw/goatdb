export function toObject<V>(map: Map<string, V>): any {
  let obj: any = {};

  map.forEach(function (value, key) {
    obj[key] = value;
  });

  return obj;
}

export function shallowClone<K, V>(map: Map<K, V>): Map<K, V> {
  const newMap = new Map<K, V>();

  map.forEach(function (value, key) {
    newMap.set(key, value);
  });

  return newMap;
}
