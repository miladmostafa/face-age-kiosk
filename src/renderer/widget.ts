import FaceAge, { type FaceAgeWidget } from 'face-age';
import { buildFaceAgeOptions } from '../shared/faceage-options';
import type { SalonProduct } from '../shared/products';

export interface MountedWidget {
  widget: FaceAgeWidget;
  dispose(): void;
}

/**
 * The installed face-age bundle calls toAnswerArray while building an email
 * payload, but that helper is missing from the build. Provide it before render.
 */
function installSdkAnswerShim(): void {
  const host = globalThis as typeof globalThis & {
    toAnswerArray?: (value: unknown) => string[];
  };
  if (typeof host.toAnswerArray === 'function') return;
  const label = (item: unknown) => (item == null ? '' : String(item).replace(/_/g, ' ').trim());
  host.toAnswerArray = (value: unknown) => {
    if (Array.isArray(value)) return value.map(label);
    if (typeof value === 'boolean') return [value ? 'Yes' : 'No'];
    if (value == null) return [];
    return [label(value)];
  };
}

export function mountWidget(input: {
  clientId: string;
  language: string;
  email: string;
  products: SalonProduct[];
  onReset: () => void;
}): MountedWidget {
  const host = document.getElementById('FaceAge-module');
  if (!host) throw new Error('The page is missing #FaceAge-module.');
  installSdkAnswerShim();

  const widget = new FaceAge(
    buildFaceAgeOptions({
      clientId: input.clientId,
      language: input.language,
      email: input.email,
    }),
  );
  const pending = widget.render();
  if (pending && typeof (pending as Promise<unknown>).catch === 'function') {
    void (pending as Promise<unknown>).catch(() => {
      /* render() rejects only when the host element is missing. */
    });
  }
  const applyProducts = () => {
    try {
      widget.API.setCustomProducts(input.products);
    } catch {
      /* The widget may already be holding the salon catalog. */
    }
  };
  applyProducts();
  void widget.onResetData(() => input.onReset());

  const retry = window.setTimeout(applyProducts, 800);
  const firstTitle = input.products[0]?.title ?? '';
  let resultApplies = 0;
  // Analysis clears the catalog. Put the salon products back once results are on screen.
  const restore = window.setInterval(() => {
    const doc = document.getElementById('FaceAge-module')?.querySelector('iframe')?.contentDocument;
    const text = doc?.body?.innerText ?? '';
    if (!text) return;
    if (firstTitle && text.includes(firstTitle)) {
      window.clearInterval(restore);
      return;
    }
    const resultsVisible = text.includes('Skin Age') || Boolean(doc?.querySelector('.loading_request_pr'));
    if (!resultsVisible) return;
    resultApplies += 1;
    applyProducts();
    if (resultApplies >= 6) window.clearInterval(restore);
  }, 700);

  return {
    widget,
    dispose() {
      window.clearTimeout(retry);
      window.clearInterval(restore);
    },
  };
}
