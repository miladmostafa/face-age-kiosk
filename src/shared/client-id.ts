export type ClientIdSource = 'settings' | 'environment' | 'none';

export interface ResolvedClientId {
  clientId: string;
  source: ClientIdSource;
}

/**
 * Settings win over the environment variable.
 * An empty result means the kiosk must ask staff to set a Client ID.
 * There is no built-in fallback id.
 */
export function resolveClientId(
  stored: string | undefined | null,
  fromEnv: string | undefined | null,
): ResolvedClientId {
  const settingsId = (stored ?? '').trim();
  if (settingsId) return { clientId: settingsId, source: 'settings' };
  const envId = (fromEnv ?? '').trim();
  if (envId) return { clientId: envId, source: 'environment' };
  return { clientId: '', source: 'none' };
}

export const CLIENT_ID_PANEL_URL = 'https://panel.getfaceage.com/';
