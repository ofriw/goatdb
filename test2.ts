import { shuffle } from './base/array.ts';
import { uniqueId } from './base/common.ts';
import { coreValueCompare } from './base/core-types/comparable.ts';
import { assert } from './base/error.ts';
import { randomInt } from './base/math.ts';
import { SchemaManager } from './cfds/base/schema.ts';
import { BloomFilter } from './cpp/bloom_filter.ts';
import { GoatDB } from './db/db.ts';
import { Query } from './repo/query.ts';

const ITEM_COUNT = 100000;

export const kSchemeNote = {
  ns: 'note',
  version: 1,
  fields: {
    text: {
      type: 'string',
      // default: () => initRichText(),
      required: true,
    },
  },
} as const;
type SchemeNoteType = typeof kSchemeNote;
SchemaManager.default.register(kSchemeNote);

const kWords = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'proident',
  'fuga',
  'sed.',
  'possimus',
  'fuga',
  'illo',
  'non',
  'sibi.',
  'id',
  'unum',
  'enim',
  'quibusdam',
  'officii.',
  'eaque',
  'qui',
  'pariatur,',
  'tempor',
  'in.',
  'error',
  'cum',
  'tenetur,',
  'ullamco',
  'magnam.',
  'enim',
  'velit',
  'laudantium,',
  'ut',
  'ipsa.',
  'quoddam',
  'colebatur',
  'propter',
  'officia.',
];

const repoPath = '/test/notes/';

async function createNewNote(db: GoatDB): Promise<void> {
  const numWords = randomInt(1, kWords.length);
  let text = '';
  for (let i = 0; i < numWords; ++i) {
    text += kWords[randomInt(0, kWords.length)] + ' ';
  }
  await db.create(repoPath + uniqueId(), kSchemeNote, {
    text,
  });
}

function changeText(text: string): string {
  const textWords = text.split(' ');
  const remove = textWords.length > 1 && randomInt(0, 2) === 1;
  const add = textWords.length === 0 || randomInt(0, 2) === 1;
  if (remove) {
    textWords.splice(randomInt(0, textWords.length), 1);
  }
  if (add) {
    textWords.splice(
      randomInt(0, textWords.length),
      0,
      kWords[randomInt(0, kWords.length)],
    );
  }
  return textWords.join(' ');
}

async function editDB(db: GoatDB, scale = 0.1): Promise<number> {
  const promises: Promise<void>[] = [];
  const totalEdits = Math.round(db.count(repoPath) * scale);
  let editCount = 0;
  while (editCount < totalEdits) {
    for (const key of db.keys(repoPath)) {
      // if (randomInt(0, Math.round(1 / scale)) === 0) {
      const item = db.item<SchemeNoteType>(repoPath, key);
      const updatedText = changeText(item.get('text'));
      if (updatedText !== item.get('text')) {
        item.set('text', updatedText);
        promises.push(item.commit());
        if (++editCount === totalEdits) {
          break;
        }
        // }
      }
    }
  }
  await Promise.allSettled(promises);
  return editCount;
}

async function populateDB(db: GoatDB): Promise<void> {
  const createPromises: Promise<void>[] = [];
  for (let i = 0; i < ITEM_COUNT; ++i) {
    createPromises.push(createNewNote(db));
  }
  await Promise.allSettled(createPromises);
  // let editCount = await editDB(db);
  // editCount += await editDB(db);
  // editCount += await editDB(db);
  // console.log(`Edited ${editCount}`);
}

const REPO_FILE_PATH =
  '/Users/ofri/Documents/ovvio/goatdb-test/test/notes.jsonl';

const DB_PATH = '/Users/ofri/Documents/ovvio/goatdb-test/';

export async function testsMain(): Promise<void> {
  const fileStart = performance.now();
  await Deno.readFile(REPO_FILE_PATH);
  console.log(`File read in ${(performance.now() - fileStart) / 1000} sec`);
  // await BloomFilter.initNativeFunctions();
  const db = new GoatDB({
    path: DB_PATH,
  });
  console.log(`Opening Repo...`);
  const repoPath = '/test/notes';
  const openStart = performance.now();
  const repo = await db.open(repoPath);
  // const repo = db.getRepository(repoId)!;
  console.log(
    `Done. Open took ${
      (performance.now() - openStart) / 1000
    } sec.\n# Commits = ${repo
      .numberOfCommits()
      .toLocaleString()}\n# Keys = ${repo.storage
      .numberOfKeys()
      .toLocaleString()}`,
  );

  if (repo.numberOfCommits() === 0) {
    console.log(`Repository is empty. Populating...`);
    const start = performance.now();
    await populateDB(db);
    await db.flush(repoPath);
    const populatingTime = performance.now() - start;
    console.log(
      `Populating repo ended. Took ${populatingTime / 1000} sec, avg ${
        populatingTime / ITEM_COUNT
      }ms/item`,
    );
  } else {
    // const editCount = await editDB(db, 0.5);
    // console.log(
    //   `Edited ${editCount}.\n# Commits = ${repo
    //     .numberOfCommits()
    //     .toLocaleString()}\n# Keys = ${repo.storage
    //     .numberOfKeys()
    //     .toLocaleString()}`,
    // );
  }

  console.log(`Starting read test...`);
  const keys = shuffle(Array.from(db.keys(repoPath))).slice(0, 10);
  const readStart = performance.now();
  const testCount = 1000;
  for (let i = 0; i < testCount; ++i) {
    for (const k of keys) {
      const item = db.item<SchemeNoteType>(repoPath, k);
      item.get('text');
    }
  }
  const readTime = (performance.now() - readStart) / testCount;
  console.log(
    `Reading ${keys.length.toLocaleString()} items took ${
      readTime / 1000
    } sec. Avg ${readTime / keys.length} ms / key`,
  );

  // debugger;
  // console.log(`Starting plain search...`);

  // const dummyStart = performance.now();
  // const results: [string, Document<SchemeNoteType>][] = [];

  // const predicate = (key: string, doc: Document<SchemeNoteType>) =>
  //   doc.get('text').startsWith('lorem');
  // for (const k of repo.keys()) {
  //   const doc = repo.valueForKey<SchemeNoteType>(k)![0];
  //   if (predicate(k, doc)) {
  //     results.push([k, doc]);
  //   }
  // }
  // results.sort((a1, a2) =>
  //   coreValueCompare(a1[1].get('text'), a2[1].get('text')),
  // );
  // console.log(
  //   `Dummy finished in ${
  //     (performance.now() - dummyStart) / 1000
  //   } sec, found ${results.length.toLocaleString()}`,
  // );

  // debugger;
  console.log(`Starting query...`);
  const queryStart = performance.now();
  let prevCount: number | undefined;
  const queryIter = 10;
  for (let i = 0; i < queryIter; ++i) {
    const query = db.query({
      source: repoPath,
      scheme: kSchemeNote,
      predicate: ({ item, ctx }) => item.get('text').startsWith(ctx.word),
      sortDescriptor: ({ left, right }) =>
        coreValueCompare(left.get('text'), right.get('text')),
      ctx: {
        word: 'lorem',
      },
    });
    await query.loadingFinished();
    query.results();
    query.close();
    if (!prevCount) {
      prevCount = query.count;
    } else {
      assert(prevCount === query.count);
    }
  }
  console.log(
    `Query finished in ${
      (performance.now() - queryStart) / queryIter
    } ms.\n# Results = ${prevCount}`,
  );

  // Deno.exit();
}

if (import.meta.main) testsMain();
