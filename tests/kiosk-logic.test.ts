import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClientId } from '../src/shared/client-id';
import { readDemoShot, sessionForDemo } from '../src/shared/demo';
import { applyEnvLayers, parseEnvFile } from '../src/shared/env-file';
import {
  buildSdkIntegrationExtra,
  explainFaceAgeError,
  isValidEmail,
  pickEmail,
  readSelections,
} from '../src/shared/email';
import { isAllowedExternalUrl } from '../src/shared/external-url';
import { buildFaceAgeOptions } from '../src/shared/faceage-options';
import { createIdleClock, IDLE_TIMEOUT_MS } from '../src/shared/idle';
import { normalizeLanguage, WIDGET_LANGUAGES } from '../src/shared/languages';
import { DEFAULT_ADMIN_PIN, pinsMatch, validatePinFormat } from '../src/shared/pin';
import { parseProductsJson, resolveCatalog } from '../src/shared/products';
import { createGuestSession, reduceGuestSession } from '../src/shared/session';
import { validateSettingsDraft } from '../src/shared/settings';

const root = path.resolve(__dirname, '..');

describe('client id', () => {
  it('does not invent a client id when nothing is configured', () => {
    expect(resolveClientId('', '')).toEqual({ clientId: '', source: 'none' });
    expect(resolveClientId('  ', undefined)).toEqual({ clientId: '', source: 'none' });
    expect(resolveClientId(null, null)).toEqual({ clientId: '', source: 'none' });
  });

  it('prefers the saved setting over the environment', () => {
    expect(resolveClientId('saved-id', 'env-id')).toEqual({ clientId: 'saved-id', source: 'settings' });
    expect(resolveClientId('', 'env-id')).toEqual({ clientId: 'env-id', source: 'environment' });
  });
});

describe('guest session', () => {
  it('requires consent and a skin type before the scan', () => {
    let session = createGuestSession();
    session = reduceGuestSession(session, { type: 'continue' });
    expect(session.stage).toBe('attract');
    session = reduceGuestSession(session, { type: 'start' });
    expect(session.stage).toBe('consent');
    expect(session.consentAccepted).toBe(false);
    session = reduceGuestSession(session, { type: 'continue' });
    expect(session.stage).toBe('consent');
    session = reduceGuestSession(session, { type: 'toggle-consent', accepted: true });
    session = reduceGuestSession(session, { type: 'continue' });
    expect(session.stage).toBe('quiz');
    session = reduceGuestSession(session, { type: 'set-email', email: 'guest@example.com' });
    session = reduceGuestSession(session, { type: 'continue' });
    expect(session.stage).toBe('quiz');
    session = reduceGuestSession(session, { type: 'set-skin', skinType: 'dry' });
    session = reduceGuestSession(session, { type: 'continue' });
    expect(session).toMatchObject({ stage: 'scan', skinType: 'dry', email: 'guest@example.com' });
  });

  it('clears consent, skin type, and email on reset', () => {
    let session = createGuestSession();
    session = reduceGuestSession(session, { type: 'start' });
    session = reduceGuestSession(session, { type: 'toggle-consent', accepted: true });
    session = reduceGuestSession(session, { type: 'continue' });
    session = reduceGuestSession(session, { type: 'set-skin', skinType: 'oily' });
    session = reduceGuestSession(session, { type: 'set-email', email: 'guest@example.com' });
    session = reduceGuestSession(session, { type: 'reset' });
    expect(session).toEqual(createGuestSession());
  });
});

describe('idle clock', () => {
  it('warns during the last 15 seconds and expires at 60 seconds', () => {
    const clock = createIdleClock();
    clock.markActivity(0);
    expect(IDLE_TIMEOUT_MS).toBe(60_000);
    expect(clock.phase(44_999)).toBe('active');
    expect(clock.phase(45_000)).toBe('warning');
    expect(clock.remainingMs(50_000)).toBe(10_000);
    expect(clock.phase(59_999)).toBe('warning');
    expect(clock.phase(60_000)).toBe('expired');
  });

  it('does not expire while staff settings are paused', () => {
    const clock = createIdleClock();
    clock.markActivity(0);
    clock.pause(10_000);
    expect(clock.phase(999_999)).toBe('active');
    clock.resume(999_999);
    expect(clock.phase(999_999)).toBe('active');
    expect(clock.phase(999_999 + 60_000)).toBe('expired');
  });
});

describe('products and settings', () => {
  const sample = readFileSync(path.join(root, 'sample/salon-products.json'), 'utf8');

  it('accepts the bundled salon catalog', () => {
    const parsed = parseProductsJson(sample);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.products.length).toBeGreaterThanOrEqual(4);
  });

  it('uses the sample catalog when staff have not replaced it', () => {
    const catalog = resolveCatalog({ fileJson: null, fileError: null, storedJson: '', sampleJson: sample });
    expect(catalog.source).toBe('sample');
    expect(catalog.products.length).toBeGreaterThan(0);
  });

  it('rejects a catalog that would fail the widget', () => {
    const parsed = parseProductsJson(JSON.stringify([{ id: 1, title: 'Missing fields' }]));
    expect(parsed.ok).toBe(false);
  });

  it('keeps an empty client id valid and checks language and products', () => {
    expect(validateSettingsDraft({ clientId: '  ', productsJson: '', productsPath: '', language: 'en' }).ok).toBe(true);
    const bad = validateSettingsDraft({
      clientId: '',
      productsJson: '{',
      productsPath: '',
      language: 'en',
    });
    expect(bad.ok).toBe(false);
    const language = validateSettingsDraft({
      clientId: '',
      productsJson: '',
      productsPath: '',
      language: 'zz',
    });
    expect(language.ok).toBe(false);
  });
});

describe('face age options', () => {
  it('turns the quiz on, keeps history off, and renders into the page module', () => {
    const options = buildFaceAgeOptions({
      clientId: 'from-settings',
      language: 'fr',
      email: 'Guest@Example.com',
    });
    expect(options).toMatchObject({
      elementId: 'FaceAge-module',
      faceageId: 'from-settings',
      displayModel: 'section',
      language: 'fr',
      quiz: true,
      history: false,
      showProducts: true,
      showRoutine: true,
      showCamera: true,
      showUpload: false,
      defaultQuiz: { email: 'Guest@Example.com' },
    });
    expect(options.displayModel).not.toBe('widget');
  });

  it('omits an invalid email from defaultQuiz', () => {
    const options = buildFaceAgeOptions({ clientId: 'abc', language: 'nope', email: 'not-an-email' });
    expect(options.defaultQuiz).toEqual({});
    expect(options.language).toBe('en');
  });
});

describe('email and pdf messages', () => {
  it('reads an email from the session or the widget quiz', () => {
    expect(isValidEmail('guest@example.com')).toBe(true);
    expect(pickEmail('guest@example.com', { email: 'other@example.com' })).toBe('guest@example.com');
    expect(pickEmail('', { clientEmail: 'quiz@example.com' })).toBe('quiz@example.com');
    expect(pickEmail('', {})).toBe('');
    expect(buildSdkIntegrationExtra('dry')).toEqual({ skinType: 'dry' });
  });

  it('explains plan and missing-scan failures', () => {
    expect(explainFaceAgeError(new Error('not access'), 'pdf')).toMatch(/plan/i);
    expect(explainFaceAgeError(new Error('No analysis data available'), 'email')).toMatch(/scan/i);
    expect(explainFaceAgeError(new Error('Email is required for SDK integration'), 'email')).toMatch(/email/i);
  });

  it('reads quiz selections from the callback API', async () => {
    const selections = await readSelections({
      getActiveSelections(callback) {
        callback({ email: 'quiz@example.com' });
      },
    });
    expect(selections.email).toBe('quiz@example.com');
  });
});

describe('staff pin and links', () => {
  it('checks the pin without treating a different length as a match', () => {
    expect(pinsMatch(DEFAULT_ADMIN_PIN, DEFAULT_ADMIN_PIN)).toBe(true);
    expect(pinsMatch('0000', DEFAULT_ADMIN_PIN)).toBe(false);
    expect(pinsMatch('25801', DEFAULT_ADMIN_PIN)).toBe(false);
    expect(validatePinFormat('12')).toMatch(/4 to 8/);
    expect(validatePinFormat('1234')).toBeNull();
  });

  it('only opens Face Age and the npm package', () => {
    expect(isAllowedExternalUrl('https://panel.getfaceage.com/')).toBe(true);
    expect(isAllowedExternalUrl('https://getfaceage.com/pricing')).toBe(true);
    expect(isAllowedExternalUrl('https://www.npmjs.com/package/face-age')).toBe(true);
    expect(isAllowedExternalUrl('https://example.com')).toBe(false);
    expect(isAllowedExternalUrl('http://panel.getfaceage.com/')).toBe(false);
  });
});

describe('env files', () => {
  it('parses env files and does not override existing process variables', () => {
    const parsed = parseEnvFile('# comment\nFACEAGE_CLIENT_ID="abc"\nOTHER=1\n');
    expect(parsed).toEqual({ FACEAGE_CLIENT_ID: 'abc', OTHER: '1' });
    const env: Record<string, string | undefined> = { FACEAGE_CLIENT_ID: 'already' };
    applyEnvLayers(env, [parsed, { OTHER: '2' }]);
    expect(env.FACEAGE_CLIENT_ID).toBe('already');
    expect(env.OTHER).toBe('2');
  });
});

describe('demo gate', () => {
  it('ignores demo shots unless the preview is allowed', () => {
    expect(readDemoShot('?demo=1&shot=consent', false)).toBeNull();
    expect(readDemoShot('?demo=1&shot=consent', true)).toBe('consent');
    expect(readDemoShot('?demo=1&shot=nope', true)).toBeNull();
    expect(sessionForDemo('quiz').stage).toBe('quiz');
  });
});

describe('english copy', () => {
  it('does not offer Persian and keeps source text in English', () => {
    expect(WIDGET_LANGUAGES.some((language) => language.code === 'fa' || /persian/i.test(language.label))).toBe(false);
    expect(normalizeLanguage('fa')).toBe('en');
    expect(normalizeLanguage('en')).toBe('en');
    for (const file of walk(path.join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/);
    }
  });
});

describe('privacy boundaries in source', () => {
  it('does not hardcode the documented local testing client id', () => {
    const readme = readFileSync(path.join(root, 'README.md'), 'utf8');
    const match = readme.match(/local testing Client ID `([A-Za-z0-9]+)`/);
    expect(match?.[1]).toBeTruthy();
    const clientId = match?.[1] ?? '';
    expect(clientId.length).toBeGreaterThan(8);
    for (const file of walk(path.join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes(clientId), file).toBe(false);
    }
  });

  it('keeps the widget iframe inside the face-age package', () => {
    const sdk = readFileSync(path.join(root, 'node_modules/face-age/dist/faceage.js'), 'utf8');
    expect(sdk).toContain('FaceAge-module-iframe');
    for (const file of walk(path.join(root, 'src'))) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('FaceAge-module-iframe'), file).toBe(false);
      expect(text.includes('createElement("iframe")') || text.includes("createElement('iframe')"), file).toBe(false);
    }
  });
});

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (entry === 'vendor') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|css|html|json|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}
