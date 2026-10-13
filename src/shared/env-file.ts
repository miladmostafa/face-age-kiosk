export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * Later files override earlier ones. Variables already present in `env`
 * (the real process environment) are left untouched.
 */
export function applyEnvLayers(
  env: Record<string, string | undefined>,
  layers: Record<string, string>[],
): void {
  const preexisting = new Set(Object.keys(env));
  const merged: Record<string, string> = {};
  for (const layer of layers) Object.assign(merged, layer);
  for (const [key, value] of Object.entries(merged)) {
    if (!preexisting.has(key)) env[key] = value;
  }
}
