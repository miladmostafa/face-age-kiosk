import sampleProducts from '../../sample/salon-products.json';
import type { BootstrapPayload, SettingsMutation } from '../shared/bootstrap';
import { resolveClientId } from '../shared/client-id';
import { IDLE_TIMEOUT_MS } from '../shared/idle';
import { DEFAULT_ADMIN_PIN, pinsMatch, validatePinFormat } from '../shared/pin';
import { resolveCatalog } from '../shared/products';
import type { SettingsDraft } from '../shared/settings';
import { photoUploadEnabled, validateSettingsDraft } from '../shared/settings';
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
const PREVIEW_SETTINGS_KEY = 'kiosk-preview-settings';

function defaultPreviewSettings(): SettingsDraft {
  return {
    clientId: '',
    productsJson: '',
    productsPath: '',
    language: 'en',
    photoUpload: true,
  };
}

function readStoredPreviewSettings(): SettingsDraft {
  const defaults = defaultPreviewSettings();
  try {
    const raw = window.localStorage.getItem(PREVIEW_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SettingsDraft>;
    return {
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      productsJson: typeof parsed.productsJson === 'string' ? parsed.productsJson : '',
      productsPath: typeof parsed.productsPath === 'string' ? parsed.productsPath : '',
      language: typeof parsed.language === 'string' ? parsed.language : 'en',
      photoUpload: photoUploadEnabled(parsed.photoUpload),
    };
  } catch {
    return defaults;
  }
}

function storePreviewSettings(settings: SettingsDraft): void {
  window.localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Browser preview only. The dev server reads FACEAGE_CLIENT_ID from the local
 * env file and returns it here. The value is not compiled into the page.
 */
async function readPreviewClientId(): Promise<string> {
  if (!import.meta.env.DEV) return '';
  try {
    const response = await fetch('/__kiosk_preview_client_id');
    if (!response.ok) return '';
    return (await response.text()).trim();
  } catch {
    return '';
  }
}

function memoryBridge(): KioskBridge {
  let settings: SettingsDraft = readStoredPreviewSettings();
  let pin = DEFAULT_ADMIN_PIN;

  const build = async (): Promise<BootstrapPayload> => {
    const catalog = resolveCatalog({
      fileJson: null,
      fileError: settings.productsPath ? 'Reading a products file requires the Electron app.' : null,
      storedJson: settings.productsJson,
      sampleJson: sampleProductsJson,
    });
    const resolved = resolveClientId(settings.clientId, await readPreviewClientId());
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
      storePreviewSettings(settings);
      return { ok: true, bootstrap: await build() };
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
      const kept = window.localStorage.getItem(PREVIEW_SETTINGS_KEY);
      window.localStorage.clear();
      window.sessionStorage.clear();
      if (kept !== null) window.localStorage.setItem(PREVIEW_SETTINGS_KEY, kept);
    },
    quit: async () => ({ ok: false, error: 'Exit is available in the Electron app.' }),
  };
}

export function getBridge(): KioskBridge {
  return window.kiosk ?? memoryBridge();
}
