export function isAllowedExternalUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'panel.getfaceage.com' || host === 'getfaceage.com' || host === 'www.getfaceage.com') {
    return true;
  }
  if (host === 'www.npmjs.com' && url.pathname.startsWith('/package/face-age')) return true;
  return false;
}
