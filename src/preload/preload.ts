import { contextBridge, ipcRenderer } from 'electron';
import type { BootstrapPayload, SettingsMutation } from '../shared/bootstrap';
import { IpcChannel } from '../shared/ipc';
import type { SettingsDraft } from '../shared/settings';

const bridge = {
  getBootstrap(): Promise<BootstrapPayload> {
    return ipcRenderer.invoke(IpcChannel.bootstrap);
  },
  saveSettings(draft: SettingsDraft, pin: string): Promise<SettingsMutation> {
    return ipcRenderer.invoke(IpcChannel.saveSettings, draft, pin);
  },
  verifyPin(pin: string): Promise<boolean> {
    return ipcRenderer.invoke(IpcChannel.verifyPin, pin);
  },
  changePin(currentPin: string, nextPin: string): Promise<{ ok: true } | { ok: false; error: string }> {
    return ipcRenderer.invoke(IpcChannel.changePin, currentPin, nextPin);
  },
  readProductsFile(filePath: string): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
    return ipcRenderer.invoke(IpcChannel.readProducts, filePath);
  },
  pickProductsFile(): Promise<string | null> {
    return ipcRenderer.invoke(IpcChannel.pickProducts);
  },
  async openExternal(url: string): Promise<void> {
    await ipcRenderer.invoke(IpcChannel.openExternal, url);
  },
  wipeGuestData(): Promise<void> {
    return ipcRenderer.invoke(IpcChannel.wipe);
  },
  quit(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
    return ipcRenderer.invoke(IpcChannel.quit, pin);
  },
};

contextBridge.exposeInMainWorld('kiosk', bridge);
