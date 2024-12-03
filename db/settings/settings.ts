import { OwnedSession, Session } from '../session.ts';

export interface DBSettings {
  currentSession: OwnedSession;
  roots: Session[];
  trustedSessions: Session[];
}

export interface DBSettingsProvider {
  readonly settings: DBSettings;
  load(): Promise<void>;
  update(settings: DBSettings): Promise<void>;
}
