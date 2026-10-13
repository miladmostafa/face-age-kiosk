export const SKIN_TYPES = ['normal', 'dry', 'oily', 'combination', 'sensitive'] as const;

export type SkinType = (typeof SKIN_TYPES)[number];

export type GuestStage = 'attract' | 'consent' | 'quiz' | 'scan';

export interface GuestSession {
  stage: GuestStage;
  consentAccepted: boolean;
  skinType: SkinType | '';
  email: string;
}

export type GuestAction =
  | { type: 'start' }
  | { type: 'toggle-consent'; accepted: boolean }
  | { type: 'set-skin'; skinType: SkinType }
  | { type: 'set-email'; email: string }
  | { type: 'continue' }
  | { type: 'reset' };

export function createGuestSession(): GuestSession {
  return {
    stage: 'attract',
    consentAccepted: false,
    skinType: '',
    email: '',
  };
}

export function isSkinType(value: string): value is SkinType {
  return (SKIN_TYPES as readonly string[]).includes(value);
}

export function reduceGuestSession(state: GuestSession, action: GuestAction): GuestSession {
  switch (action.type) {
    case 'start':
      if (state.stage !== 'attract') return state;
      return { ...createGuestSession(), stage: 'consent' };
    case 'toggle-consent':
      if (state.stage !== 'consent') return state;
      return { ...state, consentAccepted: action.accepted };
    case 'set-skin':
      if (state.stage !== 'quiz') return state;
      return { ...state, skinType: action.skinType };
    case 'set-email':
      if (state.stage !== 'quiz' && state.stage !== 'scan') return state;
      return { ...state, email: action.email };
    case 'continue':
      if (state.stage === 'consent' && state.consentAccepted) {
        return { ...state, stage: 'quiz' };
      }
      if (state.stage === 'quiz' && state.skinType) {
        return { ...state, stage: 'scan' };
      }
      return state;
    case 'reset':
      return createGuestSession();
    default:
      return state;
  }
}
