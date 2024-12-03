import React, { useContext } from 'react';
import { GoatDB, type DBConfig } from '../db/db.ts';

type GoatDBCtxProps = {
  [path: string]: GoatDB;
};

const GoatDBContext = React.createContext<GoatDBCtxProps>({});

export function useGoatDB(pathOrConfig: string | DBConfig) {
  const ctx = useContext(GoatDBContext);
  const path =
    typeof pathOrConfig === 'string' ? pathOrConfig : pathOrConfig.path;
  let db = ctx[path];
  if (!db) {
    db = new GoatDB(typeof pathOrConfig === 'string' ? { path } : pathOrConfig);
    ctx[path] = db;
  }
  return db;
}
