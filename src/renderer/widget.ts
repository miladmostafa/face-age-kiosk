import FaceAge, { type FaceAgeWidget } from 'face-age';
import { buildFaceAgeOptions } from '../shared/faceage-options';
import type { SalonProduct } from '../shared/products';

export interface MountedWidget {
  widget: FaceAgeWidget;
  dispose(): void;
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
  widget.API.setCustomProducts(input.products);
  void widget.onResetData(() => input.onReset());

  const retry = window.setTimeout(() => {
    try {
      widget.API.setCustomProducts(input.products);
    } catch {
      /* The widget may already be holding the salon catalog. */
    }
  }, 800);

  return {
    widget,
    dispose() {
      window.clearTimeout(retry);
    },
  };
}
