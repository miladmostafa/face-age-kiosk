/** First-run staff PIN. Change it in Staff settings on the device. */
export const DEFAULT_ADMIN_PIN = '2580';

export function validatePinFormat(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4 to 8 digits.';
  return null;
}

export function pinsMatch(input: string, expected: string): boolean {
  const actual = input.trim();
  const wanted = expected.trim();
  const length = Math.max(actual.length, wanted.length);
  let diff = actual.length === wanted.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (actual.charCodeAt(index) || 0) ^ (wanted.charCodeAt(index) || 0);
  }
  return diff === 0;
}
