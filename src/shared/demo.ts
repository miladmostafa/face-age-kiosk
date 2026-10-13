import { createGuestSession, type GuestSession } from './session';

export const DEMO_SHOTS = ['attract', 'consent', 'quiz', 'scan', 'missing-id', 'settings'] as const;

export type DemoShot = (typeof DEMO_SHOTS)[number];

export function readDemoShot(search: string, allowDemo: boolean): DemoShot | null {
  if (!allowDemo) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get('demo') !== '1') return null;
  const shot = params.get('shot');
  if (!shot) return 'attract';
  return (DEMO_SHOTS as readonly string[]).includes(shot) ? (shot as DemoShot) : null;
}

export function sessionForDemo(shot: DemoShot): GuestSession {
  const base = createGuestSession();
  if (shot === 'consent') return { ...base, stage: 'consent' };
  if (shot === 'quiz') return { ...base, stage: 'quiz', consentAccepted: true, skinType: 'combination' };
  if (shot === 'scan' || shot === 'missing-id') {
    return { ...base, stage: 'scan', consentAccepted: true, skinType: 'combination' };
  }
  return base;
}
