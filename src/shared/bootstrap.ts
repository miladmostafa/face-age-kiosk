import type { ClientIdSource } from './client-id';
import type { SalonProduct } from './products';
import type { SettingsDraft } from './settings';

export interface BootstrapPayload {
  settings: SettingsDraft;
  sampleProductsJson: string;
  products: SalonProduct[];
  catalogSource: 'file' | 'settings' | 'sample';
  catalogWarning?: string;
  clientId: string;
  clientIdSource: ClientIdSource;
  allowDemo: boolean;
  idleTimeoutMs: number;
  kioskLocked: boolean;
}

export type SettingsMutation =
  | { ok: true; bootstrap: BootstrapPayload }
  | { ok: false; error: string };
