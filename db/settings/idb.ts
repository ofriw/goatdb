import { openDB, DBSchema, OpenDBCallbacks } from 'https://esm.sh/idb@7.1.1';
import { DBSettings, DBSettingsProvider } from './settings.ts';
import { SerialScheduler } from '../../base/serial-scheduler.ts';
import { OwnedSession, generateKeyPair, generateSession } from '../session.ts';
import { createNewSession } from '../../net/rest-api.ts';
import { assert } from '../../base/error.ts';

const K_DB_VERSION = 1;
const K_DB_NAME = 'sessions';

interface SessionDBSchema extends DBSchema {
  session: {
    key: string;
    value: DBSettings;
  };
}

const kOpenDBOpts: OpenDBCallbacks<SessionDBSchema> = {
  upgrade(db, oldVersion, newVersion, txn, event) {
    db.createObjectStore('session', { keyPath: 'currentSession.id' });
  },
};

export class IDBSettings implements DBSettingsProvider {
  private _settings?: DBSettings;

  async load(): Promise<void> {
    const entries = await loadAllSessions();
    if (entries.length > 0) {
      this._settings = entries[0];
    } else {
      const keys = await generateKeyPair();
      const [publicSession, serverRoots] = await createNewSession(
        keys.publicKey,
      );
      const currentSession = await generateSession('root');
      // assert(publicSession !== undefined, 'Session creation failed');
      // const currentSession: OwnedSession = {
      //   ...publicSession,
      //   privateKey: keys.privateKey,
      // };
      this._settings = {
        currentSession,
        roots: [currentSession],
        trustedSessions: [],
      };
      await this.update(this._settings);
    }
  }

  get settings(): DBSettings {
    return this._settings!;
  }

  update(settings: DBSettings): Promise<void> {
    this._settings = settings;
    return SerialScheduler.get('idb').run(async () => {
      const db = await openDB(K_DB_NAME, K_DB_VERSION, kOpenDBOpts);
      await db.put('session', {
        currentSession: settings.currentSession,
        roots: settings.roots,
        trustedSessions: settings.trustedSessions,
      });
      db.close();
    });
  }
}

function loadAllSessions(): Promise<DBSettings[]> {
  return SerialScheduler.get('idb').run(async () => {
    const db = await openDB(K_DB_NAME, K_DB_VERSION, kOpenDBOpts);
    const res = await db.getAll('session');
    db.close();
    return res;
  });
}
