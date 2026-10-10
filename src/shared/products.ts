export const SKIN_PROBLEMS = [
  'fineWrinkles',
  'eyeWrinkles',
  'deepWrinkles',
  'darkCircle',
  'eyeBag',
  'pores',
  'pigment',
  'redness',
  'oiliness',
  'dryness',
  'sagginess',
  'dullness',
  'acne',
] as const;

export type SkinProblem = (typeof SKIN_PROBLEMS)[number];

export interface SalonProduct {
  id: string | number;
  url: string;
  image: string;
  title: string;
  description?: string;
  price: number;
  offerPrice?: number;
  problems?: string[];
  routineGroups?: Record<string, string[]> | string[];
}

const HTML_PATTERN = /<\/?[a-z][\s\S]*>/i;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function parseProductsJson(text: string): { ok: true; products: SalonProduct[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Products JSON is not valid JSON.' };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { products?: unknown }).products)
      ? (parsed as { products: unknown[] }).products
      : null;

  if (!list) {
    return { ok: false, error: 'Products JSON must be an array, or an object with a products array.' };
  }

  const products: SalonProduct[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    const label = `Product ${index + 1}`;
    if (!item || typeof item !== 'object') return { ok: false, error: `${label} must be an object.` };
    const record = item as Record<string, unknown>;
    if (record.id === null || record.id === undefined || record.id === '') {
      return { ok: false, error: `${label} needs an id.` };
    }
    if (typeof record.title !== 'string' || !record.title.trim()) {
      return { ok: false, error: `${label} needs a title.` };
    }
    if (HTML_PATTERN.test(record.title)) return { ok: false, error: `${label} title cannot contain HTML.` };
    if (record.description !== undefined) {
      if (typeof record.description !== 'string') return { ok: false, error: `${label} description must be text.` };
      if (HTML_PATTERN.test(record.description)) {
        return { ok: false, error: `${label} description cannot contain HTML.` };
      }
    }
    if (typeof record.url !== 'string' || !isHttpUrl(record.url.trim())) {
      return { ok: false, error: `${label} needs an http(s) url.` };
    }
    if (typeof record.image !== 'string' || !isHttpUrl(record.image.trim())) {
      return { ok: false, error: `${label} needs an http(s) image URL.` };
    }
    if (typeof record.price !== 'number' || !Number.isFinite(record.price) || record.price < 0) {
      return { ok: false, error: `${label} price must be a non-negative number.` };
    }
    if (record.offerPrice !== undefined) {
      if (typeof record.offerPrice !== 'number' || !Number.isFinite(record.offerPrice) || record.offerPrice < 0) {
        return { ok: false, error: `${label} offerPrice must be a non-negative number.` };
      }
    }
    if (record.problems !== undefined) {
      if (!Array.isArray(record.problems) || record.problems.some((problem) => typeof problem !== 'string')) {
        return { ok: false, error: `${label} problems must be an array of strings.` };
      }
      const unknown = record.problems.filter(
        (problem) => !(SKIN_PROBLEMS as readonly string[]).includes(problem),
      );
      if (unknown.length) {
        return { ok: false, error: `${label} has unknown problems: ${unknown.join(', ')}.` };
      }
    }
    if (record.routineGroups !== undefined) {
      const groups = record.routineGroups;
      const valid =
        Array.isArray(groups) || (groups !== null && typeof groups === 'object');
      if (!valid) return { ok: false, error: `${label} routineGroups must be an object or array.` };
    }

    const product: SalonProduct = {
      id: record.id as string | number,
      url: record.url.trim(),
      image: record.image.trim(),
      title: record.title.trim(),
      price: record.price,
    };
    if (typeof record.description === 'string' && record.description.trim()) {
      product.description = record.description.trim();
    }
    if (typeof record.offerPrice === 'number') product.offerPrice = record.offerPrice;
    if (Array.isArray(record.problems)) product.problems = record.problems as string[];
    if (record.routineGroups && typeof record.routineGroups === 'object') {
      product.routineGroups = record.routineGroups as SalonProduct['routineGroups'];
    }
    products.push(product);
  }

  return { ok: true, products };
}

export function resolveCatalog(options: {
  fileJson: string | null;
  fileError: string | null;
  storedJson: string;
  sampleJson: string;
}): { products: SalonProduct[]; source: 'file' | 'settings' | 'sample'; warning?: string } {
  if (options.fileError) {
    const stored = options.storedJson.trim()
      ? parseProductsJson(options.storedJson)
      : parseProductsJson(options.sampleJson);
    if (!stored.ok) {
      return { products: [], source: options.storedJson.trim() ? 'settings' : 'sample', warning: options.fileError };
    }
    return {
      products: stored.products,
      source: options.storedJson.trim() ? 'settings' : 'sample',
      warning: `${options.fileError} Using ${options.storedJson.trim() ? 'saved' : 'sample'} products instead.`,
    };
  }

  if (options.fileJson && options.fileJson.trim()) {
    const parsed = parseProductsJson(options.fileJson);
    if (!parsed.ok) return { products: [], source: 'file', warning: parsed.error };
    return { products: parsed.products, source: 'file' };
  }

  if (options.storedJson.trim()) {
    const parsed = parseProductsJson(options.storedJson);
    if (!parsed.ok) return { products: [], source: 'settings', warning: parsed.error };
    return { products: parsed.products, source: 'settings' };
  }

  const sample = parseProductsJson(options.sampleJson);
  if (!sample.ok) return { products: [], source: 'sample', warning: sample.error };
  return { products: sample.products, source: 'sample' };
}
