const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function pickEmail(sessionEmail: string, selections: Record<string, unknown> | null): string {
  const typed = sessionEmail.trim();
  if (isValidEmail(typed)) return typed;
  if (!selections) return '';
  for (const key of ['email', 'clientEmail']) {
    const value = selections[key];
    if (typeof value === 'string' && isValidEmail(value)) return value.trim();
  }
  return '';
}

export function buildSdkIntegrationExtra(skinType: string): { skinType: string } | undefined {
  const trimmed = skinType.trim();
  if (!trimmed) return undefined;
  return { skinType: trimmed };
}

export type FaceAgeAction = 'email' | 'pdf';

export function explainFaceAgeError(error: unknown, action: FaceAgeAction): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (action === 'pdf' && /not access/i.test(message)) {
    return 'PDF reports are not included in this Face Age plan. The on-screen results are still available.';
  }
  if (/no analysis data/i.test(message)) {
    return 'Finish the face scan before sending results.';
  }
  if (/email is required/i.test(message)) {
    return 'Enter an email address to send the results.';
  }
  if (action === 'pdf') {
    return 'The PDF report could not be created. PDF access depends on the Face Age plan.';
  }
  return 'The results could not be emailed. Check the address and try again.';
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function readSelections(
  api: { getActiveSelections: (callback: (data: unknown) => void) => void },
  timeoutMs = 1500,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (data: unknown) => {
      if (settled) return;
      settled = true;
      if (data && typeof data === 'object') resolve(data as Record<string, unknown>);
      else resolve({});
    };
    try {
      api.getActiveSelections((data) => finish(data));
    } catch {
      finish({});
      return;
    }
    setTimeout(() => finish({}), timeoutMs);
  });
}
