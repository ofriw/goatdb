import React, { useRef } from 'react';
import { createUseStyles } from 'react-jss';
import { useDB, useDBReady, useQuery } from '../../react/db.tsx';
import { kSchemaTask } from './schemes.ts';

const REPO_PATH = '/data/tasks';

const useAppStyles = createUseStyles({
  app: {},
  task: {
    border: '1px solid black',
  },
});

export function Header() {
  const db = useDB();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input type="text" ref={ref}></input>
      <button
        onClick={() => {
          db.create(REPO_PATH, kSchemaTask, {
            text: ref.current!.value,
          });
        }}
      >
        Add
      </button>
    </div>
  );
}

export function Contents() {
  const styles = useAppStyles();
  const query = useQuery({
    schema: kSchemaTask,
    source: REPO_PATH,
    // predicate: ({ item }) => item.get('text').startsWith('lorem'),
  });
  return (
    <div>
      <Header />
      {query.results().map(({ key, item }) => (
        <div key={key} className={styles.task}>
          {item.get('text')}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const ready = useDBReady();

  if (ready === 'error') {
    return <div>Error! Please reload the page.</div>;
  }
  if (ready === 'loading') {
    return <div>Loading...</div>;
  }
  return <Contents />;
}
