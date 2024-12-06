import React, { useRef } from 'react';
import { createUseStyles } from 'react-jss';
import { useDB, useQuery } from '../../react/db.tsx';
import { kSchemeTask } from './schemes.ts';

const REPO_PATH = '/data/tasks';

const useAppStyles = createUseStyles({
  app: {},
});

export function Header() {
  const db = useDB();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input type="text" ref={ref}></input>
      <button
        onClick={() => {
          db.create(REPO_PATH, kSchemeTask, {
            text: ref.current!.value,
          });
        }}
      >
        Add
      </button>
    </div>
  );
}

export function App() {
  const styles = useAppStyles();
  const query = useQuery({
    scheme: kSchemeTask,
    source: REPO_PATH,
  });
  return (
    <div>
      <Header />
      {query.results().map(({ key, item }) => (
        <div key={key}>
          {key}: {item.get('text')}
        </div>
      ))}
    </div>
  );
}
