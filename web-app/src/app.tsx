import React from 'react';
import { createUseStyles } from 'react-jss';
import { useGoatDB } from '../../react/db.tsx';
import type { GoatDB } from '../../db/db.ts';
import { kSchemeTask } from './schemes.ts';
import { testsMain } from '../../test2.ts';

const useAppStyles = createUseStyles({
  app: {},
});

export function App() {
  const styles = useAppStyles();
  const db = useGoatDB('todo');
  loadDataIfNeeded(db);
  testsMain();
  return <div className={styles.app}>TEST</div>;
}

async function loadDataIfNeeded(db: GoatDB): Promise<void> {
  const repo = await db.open('/data/test');
  const keys = Array.from(repo.keys());
  if (keys.length === 0) {
    await db.create('/data/test/foo', kSchemeTask, {
      text: 'task 1',
    });
  } else {
    // console.log(keys);
  }
}
