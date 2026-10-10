import { isValidEmail } from './email';
import { normalizeLanguage } from './languages';

export interface FaceAgeWidgetOptions {
  elementId: 'FaceAge-module';
  faceageId: string;
  displayModel: 'section';
  language: string;
  height: string;
  quiz: true;
  defaultQuiz: { email?: string };
  history: false;
  showProducts: true;
  showRoutine: true;
  showAddToCard: false;
  showCamera: true;
  showUpload: false;
  currency: string;
}

/**
 * Section mode is required. The installed face-age package forces quiz,
 * products, and routines off when displayModel is "widget".
 */
export function buildFaceAgeOptions(input: {
  clientId: string;
  language: string;
  email: string;
}): FaceAgeWidgetOptions {
  const email = input.email.trim();
  return {
    elementId: 'FaceAge-module',
    faceageId: input.clientId.trim(),
    displayModel: 'section',
    language: normalizeLanguage(input.language),
    height: '100%',
    quiz: true,
    defaultQuiz: isValidEmail(email) ? { email } : {},
    history: false,
    showProducts: true,
    showRoutine: true,
    showAddToCard: false,
    showCamera: true,
    showUpload: false,
    currency: '$',
  };
}
