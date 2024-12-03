import { VCurrent, VersionNumber } from '../base/version-number.ts';

export interface OvvioConfig {
  version: VersionNumber;
  debug: boolean;
  orgId?: string;
  tenantSetup?: boolean;
  clientData?: unknown;
  serverURL?: string;
  serverData?: unknown;
}

export function getOvvioConfig(): OvvioConfig {
  let config = (self as any).OvvioConfig as OvvioConfig | undefined;
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
  return getOvvioConfig().clientData as T;
}

export function setClientData<T>(data: T | undefined): void {
  getOvvioConfig().clientData = data;
}
