import { isValidEmail } from './email';
import { normalizeLanguage } from './languages';
import type { CaptureMode } from './session';

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
  showCamera: boolean;
  showUpload: boolean;
  currency: string;
}

export interface FaceCaptureChoice {
  showCamera: boolean;
  showUpload: boolean;
  mode: 'camera' | 'upload' | 'unavailable';
}

/**
 * The camera stays the default. Photo upload uses the face-age showUpload path.
 * When upload is allowed and the device has no camera, the scan opens on upload.
 * The widget refuses to render if both capture paths are off, so that case is
 * reported here and the page does not construct the widget.
 */
export function resolveFaceCapture(input: {
  photoUpload: boolean;
  cameraAvailable: boolean;
  requested: CaptureMode;
}): FaceCaptureChoice {
  const uploadAllowed = input.photoUpload;
  if (!input.cameraAvailable && !uploadAllowed) {
    return { showCamera: false, showUpload: false, mode: 'unavailable' };
  }
  const useUpload = uploadAllowed && (input.requested === 'upload' || !input.cameraAvailable);
  if (useUpload) {
    return { showCamera: false, showUpload: true, mode: 'upload' };
  }
  return { showCamera: true, showUpload: uploadAllowed, mode: 'camera' };
}

/**
 * Section mode is required. The installed face-age package forces quiz,
 * products, and routines off when displayModel is "widget".
 */
export function buildFaceAgeOptions(input: {
  clientId: string;
  language: string;
  email: string;
  showCamera: boolean;
  showUpload: boolean;
}): FaceAgeWidgetOptions {
  if (!input.showCamera && !input.showUpload) {
    throw new Error('No camera is available, and photo upload is turned off.');
  }
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
    showCamera: input.showCamera,
    showUpload: input.showUpload,
    currency: '$',
  };
}
