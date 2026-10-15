import { hasVideoInput } from '../shared/camera';

/** Whether this browser can see a camera. A failure is treated as no camera. */
export async function cameraIsAvailable(): Promise<boolean> {
  const media = navigator.mediaDevices;
  if (!media?.enumerateDevices) return false;
  try {
    const devices = await media.enumerateDevices();
    return hasVideoInput(devices);
  } catch {
    return false;
  }
}
