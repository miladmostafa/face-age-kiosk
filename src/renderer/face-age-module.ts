import type { FaceAgeWidgetOptions } from '../shared/faceage-options';
import type { SalonProduct } from '../shared/products';

export interface FaceAgeApi {
  setCustomProducts(products: SalonProduct[]): void;
  getActiveSelections(callback: (data: unknown) => void): void;
  submitSdkIntegration(email?: string, extra?: Record<string, unknown>): Promise<unknown>;
  getReportPdf(): Promise<unknown>;
}

export interface FaceAgeWidget {
  render(): Promise<unknown> | void;
  API: FaceAgeApi;
  onResetData(callback: () => void): Promise<unknown> | void;
}

export interface FaceAgeConstructor {
  new (options: FaceAgeWidgetOptions): FaceAgeWidget;
}

declare global {
  interface Window {
    FaceAge?: FaceAgeConstructor;
  }
}

function loadConstructor(): FaceAgeConstructor {
  const constructor = window.FaceAge;
  if (typeof constructor !== 'function') {
    throw new Error(
      'The face-age package is not loaded. Install the latest release with npm install face-age@latest and restart the kiosk.',
    );
  }
  return constructor;
}

/**
 * Binds the constructor published by the installed face-age UMD bundle.
 * The bundle is copied from node_modules and loaded as a classic script so its
 * own chunk files stay beside it. This module does not recreate that bundle.
 */
const FaceAge: FaceAgeConstructor = new Proxy(function FaceAge() {
  return undefined;
}, {
  construct(_target, args: [FaceAgeWidgetOptions]) {
    const Constructor = loadConstructor();
    return new Constructor(args[0]);
  },
}) as unknown as FaceAgeConstructor;

export default FaceAge;
