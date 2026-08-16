import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getOllamaStatus: () => ipcRenderer.invoke('get-ollama-status'),
  installOllama: () => ipcRenderer.invoke('install-ollama'),
  onDownloadProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('ollama-download-progress', (_event, percent) => callback(percent));
  },
  
  // 🚀 AUTO-UPDATER BRIDGES
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback: (data: { status: string; info?: any }) => void) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },

  getBackendPort: async () => {
    return await ipcRenderer.invoke('get-backend-port');
  },
  
  // 🚀 HARDWARE & POWER MODE BRIDGE
  getHardwareProfile: () => ipcRenderer.invoke('get-hardware-profile'),
  setPowerMode: (isEco: boolean) => ipcRenderer.invoke('set-power-mode', isEco),
  onSystemStatusChange: (callback: (data: any) => void) => {
    ipcRenderer.on('system-status-change', (_event, data) => callback(data));
  }
});