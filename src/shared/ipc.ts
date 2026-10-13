export const IpcChannel = {
  bootstrap: 'kiosk:bootstrap',
  saveSettings: 'kiosk:save-settings',
  verifyPin: 'kiosk:verify-pin',
  changePin: 'kiosk:change-pin',
  readProducts: 'kiosk:read-products',
  pickProducts: 'kiosk:pick-products',
  openExternal: 'kiosk:open-external',
  wipe: 'kiosk:wipe',
  quit: 'kiosk:quit',
} as const;
