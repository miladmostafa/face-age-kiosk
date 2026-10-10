import sampleProducts from '../../sample/salon-products.json';
import type { BootstrapPayload, SettingsMutation } from '../shared/bootstrap';
import { resolveClientId } from '../shared/client-id';
import { IDLE_TIMEOUT_MS } from '../shared/idle';
import { DEFAULT_ADMIN_PIN, pinsMatch, validatePinFormat } from '../shared/pin';
import { resolveCatalog } from '../shared/products';
import type { SettingsDraft } from '../shared/settings';
import { validateSettingsDraft } from '../shared/settings';
import { isAllowedExternalUrl } from '../shared/external-url';

export interface KioskBridge {
  getBootstrap(): Promise<BootstrapPayload>;
  saveSettings(draft: SettingsDraft, pin: string): Promise<SettingsMutation>;
  verifyPin(pin: string): Promise<boolean>;
  changePin(currentPin: string, nextPin: string): Promise<{ ok: true } | { ok: false; error: string }>;
  readProductsFile(filePath: string): Promise<{ ok: true; json: string } | { ok: false; error: string }>;
  pickProductsFile(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  wipeGuestData(): Promise<void>;
  quit(pin: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    kiosk?: KioskBridge;
  }
}

const sampleProductsJson = JSON.stringify(sampleProducts);

function memoryBridge(): KioskBridge {
  let settings: SettingsDraft = {
    clientId: '',
    productsJson: '',
    productsPath: '',
    language: 'en',
  };
  let pin = DEFAULT_ADMIN_PIN;

  const build = (): BootstrapPayload => {
    const catalog = resolveCatalog({
      fileJson: null,
      fileError: settings.productsPath ? 'Reading a products file requires the Electron app.' : null,
      storedJson: settings.productsJson,
      sampleJson: sampleProductsJson,
    });
    const resolved = resolveClientId(settings.clientId, '');
    return {
      settings: { ...settings },
      sampleProductsJson,
      products: catalog.products,
      catalogSource: catalog.source,
      catalogWarning: catalog.warning,
      clientId: resolved.clientId,
      clientIdSource: resolved.source,
      allowDemo: true,
      idleTimeoutMs: IDLE_TIMEOUT_MS,
      kioskLocked: false,
    };
  };

  return {
    getBootstrap: async () => build(),
    verifyPin: async (input) => pinsMatch(input, pin),
    saveSettings: async (draft, staffPin) => {
      if (!pinsMatch(staffPin, pin)) return { ok: false, error: 'Incorrect PIN.' };
      const validated = validateSettingsDraft(draft);
      if (!validated.ok) return validated;
      settings = validated.value;
      return { ok: true, bootstrap: build() };
    },
    changePin: async (currentPin, nextPin) => {
      if (!pinsMatch(currentPin, pin)) return { ok: false, error: 'Incorrect PIN.' };
      const format = validatePinFormat(nextPin);
      if (format) return { ok: false, error: format };
      pin = nextPin;
      return { ok: true };
    },
    readProductsFile: async () => ({ ok: false, error: 'Choose a products file from the Electron app.' }),
    pickProductsFile: async () => null,
    openExternal: async (url) => {
      if (!isAllowedExternalUrl(url)) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    wipeGuestData: async () => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    },
    quit: async () => ({ ok: false, error: 'Exit is available in the Electron app.' }),
  };
}

export function getBridge(): KioskBridge {
  return window.kiosk ?? memoryBridge();
}
