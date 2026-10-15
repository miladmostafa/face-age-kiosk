/** True when the device list includes a camera. The list is collected by the page. */
export function hasVideoInput(devices: ReadonlyArray<{ kind: string }>): boolean {
  return devices.some((device) => device.kind === 'videoinput');
}
