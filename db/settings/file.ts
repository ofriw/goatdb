import * as path from 'std/path/mod.ts';
import {
  OwnedSession,
  EncodedSession,
  decodeSession,
  generateSession,
  encodeSession,
  Session,
  generateKeyPair,
} from '../session.ts';
import { prettyJSON } from '../../base/common.ts';
import {
  JSONDecoder,
  JSONEncoder,
} from '../../base/core-types/encoding/json.ts';
import { kDayMs, kSecondMs } from '../../base/date.ts';
import { assert } from '../../base/error.ts';
import { DBSettings, DBSettingsProvider } from './settings.ts';
import { readTextFile, writeTextFile } from '../../base/json-log/json-log.ts';
import { createNewSession } from '../../net/rest-api.ts';
import { serviceUnavailable } from '../../cfds/base/errors.ts';
import { SimpleTimer } from '../../base/timer.ts';

export type FileSettingsMode = 'server' | 'client';

export class FileSettings implements DBSettingsProvider {
  private _settings?: DBSettings;

  constructor(readonly dir: string, readonly mode: FileSettingsMode) {}

  async load(): Promise<void> {
    let currentSession: OwnedSession | undefined;
    let updatedSettings = false;
    let roots: Session[] = [];
    const trustedSessions: Session[] = [];
    const text = await readTextFile(this.filePath);
    if (text) {
      try {
        const decoder = new JSONDecoder(JSON.parse(text));
        const encodedSession = decoder.get('currentSession') as
          | EncodedSession
          | undefined;
        if (encodedSession) {
          assert(encodedSession.privateKey !== undefined);
          currentSession = (await decodeSession(
            encodedSession,
          )) as OwnedSession;
        }
        if (decoder.has('roots')) {
          for (const es of decoder.get<EncodedSession[]>('roots')!) {
            roots.push(await decodeSession(es));
          }
        }
        if (decoder.has('trustedSessions')) {
          for (const es of decoder.get<EncodedSession[]>('trustedSessions')!) {
            trustedSessions.push(await decodeSession(es));
          }
        }
      } catch (_: unknown) {
        // Ignore any errors
      }
    }

    if (!currentSession) {
      // Clients must request the server to generate a new session for them
      if (this.mode === 'client') {
        const keys = await generateKeyPair();
        const [publicSession, serverRoots] = await createNewSession(
          keys.publicKey,
        );
        if (publicSession) {
          currentSession = {
            ...publicSession,
            privateKey: keys.privateKey,
          };
          updatedSettings = true;
        }
        if (serverRoots) {
          roots = serverRoots;
          updatedSettings = true;
        }
      } else {
        // The server can simply go ahead and generate a self signed session
        // for itself.
        currentSession = await generateSession('root');
      }
    } else if (currentSession.expiration.getTime() - Date.now() < 15 * kDayMs) {
      currentSession.expiration = new Date(Date.now() + 30 * kDayMs);
      updatedSettings = true;
    }
    if (!currentSession) {
      throw serviceUnavailable();
    }
    this._settings = {
      currentSession,
      roots,
      trustedSessions,
    };
    if (updatedSettings) {
      await this.update(this._settings);
    }
  }

  get filePath(): string {
    return path.join(this.dir, 'settings.json');
  }

  get settings(): DBSettings {
    return this._settings!;
  }

  async update(settings: DBSettings): Promise<void> {
    assert(settings !== undefined);
    this._settings = settings;
    const roots: EncodedSession[] = [];
    const trustedSessions: EncodedSession[] = [];
    for (const s of settings.roots) {
      roots.push(await encodeSession(s));
    }
    for (const s of settings.trustedSessions) {
      trustedSessions.push(await encodeSession(s));
    }
    const encodedSettings = {
      currentSession: await encodeSession(settings.currentSession),
      roots,
      trustedSessions,
    };
    // await Deno.mkdir(path.dirname(this.filePath), { recursive: true });
    if (
      !(await writeTextFile(
        this.filePath,
        prettyJSON(JSONEncoder.toJS(encodedSettings)),
      ))
    ) {
      SimpleTimer.once(kSecondMs, () => this.update(this.settings));
    }
  }
}
