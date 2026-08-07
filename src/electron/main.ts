import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import { ensureOllamaRunning, downloadAndInstallOllama } from './ollamaManager';

let mainWindow: BrowserWindow | null = null;
let isManualCheck = false; // Tracks if the user clicked the menu button

// 1. Auto-updater Settings
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[Auto-Updater] Initial check error:', err);
  });

  setInterval(() => {
    isManualCheck = false; 
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[Auto-Updater] Scheduled check error:', err);
    });
  }, 1000 * 60 * 30);

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

// Handle App Uninstallation Routine
function handleUninstall() {
  if (!mainWindow) return;

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Uninstall ScrapeForge',
    message: 'Are you sure you want to uninstall ScrapeForge?',
    detail: 'This will close the application and launch the system uninstaller.',
    buttons: ['Cancel', 'Uninstall Now'],
    defaultId: 0,
    cancelId: 0
  }).then((result) => {
    if (result.response === 1) {
      if (process.platform === 'win32') {
        // Windows NSIS Uninstaller path lookup or standard settings trigger
        const uninstallerPath = path.join(process.execPath, '../../Uninstall ScrapeForge.exe');
        if (fs.existsSync(uninstallerPath)) {
          cp.spawn(uninstallerPath, { detached: true, stdio: 'ignore' }).unref();
          app.quit();
        } else {
          // Fallback if path differs: open Windows Apps & Features settings
          shell.openExternal('ms-settings:appsfeatures');
          app.quit();
        }
      } else if (process.platform === 'darwin') {
        dialog.showMessageBox(mainWindow!, {
          type: 'info',
          title: 'Uninstall on macOS',
          message: 'To uninstall ScrapeForge, simply drag the application from your Applications folder to the Trash.'
        });
      } else {
        dialog.showMessageBox(mainWindow!, {
          type: 'info',
          title: 'Uninstall on Linux',
          message: 'Please use your Linux distribution package manager or remove the AppImage file manually.'
        });
      }
    }
  });
}

// 2. Build the Native OS Window Menu (Help + Uninstall)
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
          label: 'Uninstall ScrapeForge...',
          click: () => {
            handleUninstall();
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
                buttons: ['OK', 'Visit Website'],
                defaultId: 0
              }).then((result) => {
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

  setupNativeMenu();

  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false);
      event.preventDefault(); 
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