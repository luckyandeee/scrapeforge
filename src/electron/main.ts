import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import { ensureOllamaRunning, downloadAndInstallOllama } from './ollamaManager';

let mainWindow: BrowserWindow | null = null;
let isManualCheck = false; // Tracks if the user clicked the menu button

// Inject the read-only GitHub token so electron-updater can access the private repo
process.env.GH_TOKEN = "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";

// 1. Auto-updater Settings
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater(win: BrowserWindow) {
  // Initial check on application startup
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[Auto-Updater] Initial check error:', err);
  });

  // Scheduled check every 30 minutes
  setInterval(() => {
    isManualCheck = false; // Background checks are silent
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[Auto-Updater] Scheduled check error:', err);
    });
  }, 1000 * 60 * 30);

  // If the user manually checks and no update is found, tell them!
  autoUpdater.on('update-not-available', () => {
    if (isManualCheck && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Up to Date',
        message: 'ScrapeForge is already up to date!',
        detail: `You are running the latest version: ${app.getVersion()}`
      });
      isManualCheck = false;
    }
  });

  // Prompt user when update binary download is complete
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Ready to Install',
      message: `A new version of ScrapeForge (${info.version}) has been downloaded!`,
      detail: 'Would you like to restart and apply the update now?',
      buttons: ['Restart & Update', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
}

// 2. Build the Native OS Window Menu (Help Only)
function setupNativeMenu() {
  const template = [
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: async () => {
            isManualCheck = true; 
            try {
              await autoUpdater.checkForUpdates();
            } catch (err: any) {
              if (mainWindow) {
                dialog.showErrorBox(
                  'Update Check Failed', 
                  'Could not check for updates. Make sure you are connected to the internet.\n\nDetails: ' + err.message
                );
              }
              isManualCheck = false;
            }
          }
        },
        { type: 'separator' },
        {
          label: 'About ScrapeForge',
          click: () => {
            if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About ScrapeForge',
                message: 'ScrapeForge Engine',
                detail: `Version: ${app.getVersion()}\nPowered by VSS Gowri Tech Online Private Limited.`,
                buttons: ['OK', 'Visit Website'], // Added clickable button
                defaultId: 0
              }).then((result) => {
                // If the user clicks "Visit Website" (which is index 1 in the buttons array)
                if (result.response === 1) {
                  shell.openExternal('https://vssgowritechonline.com');
                }
              });
            }
          }
        }
      ]
    }
  ];

  // Apply the menu to the application
  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#020617',
    icon: path.join(__dirname, '../dist/Gemini_Generated_Image_u6aa2ku6aa2ku6aa.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Initialize the native top menu
  setupNativeMenu();

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  // NEW: Listen for ESC to exit Fullscreen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false);
      event.preventDefault(); // Stop event propagation
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      setupAutoUpdater(mainWindow);
    }
  });
}

app.whenReady().then(async () => {
  const ollamaStatus = await ensureOllamaRunning();
  console.log('[Ollama Status]:', ollamaStatus.message);

  ipcMain.handle('get-ollama-status', async () => {
    return ollamaStatus;
  });

  ipcMain.handle('install-ollama', async (event) => {
    return await downloadAndInstallOllama((percent) => {
      event.sender.send('ollama-download-progress', percent);
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});