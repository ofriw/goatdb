import { VCurrent, VersionNumber } from '../base/version-number.ts';

export interface GoatConfig {
  version: VersionNumber;
  debug: boolean;
  orgId?: string;
  tenantSetup?: boolean;
  clientData?: unknown;
  serverURL?: string;
  serverData?: unknown;
}

export function getGoatConfig(): GoatConfig {
  let config = (self as any).OvvioConfig as GoatConfig | undefined;
  if (!config) {
    config = config || {
      version: VCurrent,
      debug: false,
    };
    (self as any).OvvioConfig = config;
  }
  return config;
}

export function getClientData<T>(): T | undefined {
  return getGoatConfig().clientData as T;
}

export function setClientData<T>(data: T | undefined): void {
  getGoatConfig().clientData = data;
}
