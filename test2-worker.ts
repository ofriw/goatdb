import { CoreObject } from './base/core-types/base.ts';

import { assert } from './base/error.ts';
import { Item } from './cfds/base/item.ts';
import { SchemaManager } from './cfds/base/schema.ts';
import { Query, SortDescriptor } from './repo/query.ts';
import { kSchemeNote } from './test2.ts';

SchemaManager.default.register(kSchemeNote);
const gDocsSet = new Map<string, Item>();

interface EntryPayload {
  type: 'entry';
  key: string;
  data: CoreObject;
  schemeId: string;
  checksum: string;
}

interface QueryPayload {
  type: 'query';
  predicate: string;
  sortBy?: string;
  name: string;
}

interface ScanPayload {
  type: 'scan';
  name: string;
  results?: string[];
  time?: number;
  totalScanned?: number;
}

type Payload = EntryPayload | QueryPayload | ScanPayload;

type Predicate = (key: string, doc: Item) => boolean;

let registeredPredicates = new Map<
  string,
  {
    predicate: Predicate;
    sortBy?: SortDescriptor;
  }
>();

function parseFunction<T extends Function>(str: string): T {
  return eval?.(`"use strict";(${str})`);
}

onmessage = (event: MessageEvent<Payload[]>) => {
  for (const e of event.data) {
    if (e.type === 'entry') {
      const scheme = SchemaManager.default.decode(e.schemeId);
      if (scheme) {
        const doc = new Item({
          schema,
          data: e.data,
        });
        assert(doc.checksum === e.checksum);
        gDocsSet.set(e.key, doc);
      }
    } else if (e.type === 'query') {
      registeredPredicates.set(e.name, {
        predicate: parseFunction(e.predicate),
        sortBy: e.sortBy ? parseFunction<SortDescriptor>(e.sortBy) : undefined,
      });
    } else if (e.type === 'scan') {
      const results: [string, Item][] = [];
      const { predicate, sortBy } = registeredPredicates.get(e.name) || {};
      if (!predicate) {
        postMessage([
          {
            ...e,
            results,
            time: 0,
            totalScanned: 0,
          },
        ]);
        break;
      }
      const start = performance.now();
      for (const [key, doc] of gDocsSet) {
        if (predicate(key, doc)) {
          results.push([key, doc]);
        }
      }
      if (sortBy) {
        results.sort((a1, a2) => sortBy(a1[0], a1[1], a2[0], a2[1]));
      }
      const keys: string[] = [];
      for (const e of results) {
        keys.push(e[0]);
      }
      postMessage([
        {
          ...e,
          results: keys,
          totalScanned: gDocsSet.size,
          time: performance.now() - start,
        },
      ]);
    }
  }
};

// setInterval(() => {
//   console.log(`Worker count: ${gDocsSet.size.toLocaleString()}`);
// }, 1000);
