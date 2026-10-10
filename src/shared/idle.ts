export const IDLE_TIMEOUT_MS = 60_000;
export const IDLE_WARNING_LEAD_MS = 15_000;

export type IdlePhase = 'active' | 'warning' | 'expired';

export interface IdleClock {
  markActivity(now: number): void;
  pause(now: number): void;
  resume(now: number): void;
  phase(now: number): IdlePhase;
  remainingMs(now: number): number;
  readonly paused: boolean;
}

export function createIdleClock(
  timeoutMs = IDLE_TIMEOUT_MS,
  warningLeadMs = IDLE_WARNING_LEAD_MS,
): IdleClock {
  let lastActivity = 0;
  let paused = false;

  return {
    get paused() {
      return paused;
    },
    markActivity(now: number) {
      if (!paused) lastActivity = now;
    },
    pause() {
      paused = true;
    },
    resume(now: number) {
      paused = false;
      lastActivity = now;
    },
    phase(now: number): IdlePhase {
      if (paused) return 'active';
      const idleFor = now - lastActivity;
      if (idleFor >= timeoutMs) return 'expired';
      if (idleFor >= timeoutMs - warningLeadMs) return 'warning';
      return 'active';
    },
    remainingMs(now: number): number {
      if (paused) return timeoutMs;
      return Math.max(0, timeoutMs - (now - lastActivity));
    },
  };
}
