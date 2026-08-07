import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getOllamaStatus: () => ipcRenderer.invoke('get-ollama-status'),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  onDownloadProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('ollama-download-progress', (_event, percent) => callback(percent));
  },
  // NEW: Manual Update Check
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
});