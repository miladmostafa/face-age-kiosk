import { normalizeLanguage } from './languages';
import { parseProductsJson } from './products';

export interface SettingsDraft {
  clientId: string;
  productsJson: string;
  productsPath: string;
  language: string;
  /** When false, the kiosk stays camera-only. Missing or any other value stays on. */
  photoUpload: boolean;
}

export function photoUploadEnabled(value: boolean | undefined): boolean {
  return value !== false;
}

export function validateSettingsDraft(
  draft: SettingsDraft,
): { ok: true; value: SettingsDraft } | { ok: false; error: string } {
  const clientId = draft.clientId.trim();
  const productsJson = draft.productsJson.trim();
  const productsPath = draft.productsPath.trim();
  const language = normalizeLanguage(draft.language);
  const photoUpload = photoUploadEnabled(draft.photoUpload);
  if (draft.language.trim() && language !== draft.language.trim().toLowerCase()) {
    return { ok: false, error: 'Choose a language supported by Face Age.' };
  }
  if (productsJson) {
    const parsed = parseProductsJson(productsJson);
    if (!parsed.ok) return parsed;
  }
  return {
    ok: true,
    value: { clientId, productsJson, productsPath, language, photoUpload },
  };
}
