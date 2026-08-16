// import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
// import { autoUpdater } from 'electron-updater';
// import * as path from 'path';
// import * as cp from 'child_process';
// import * as fs from 'fs';

// // 🚀 1. GUARANTEED SYSTEM LOGGER (With 5MB Auto-Rotation)
// function logToSystem(msg: string) {
//   try {
//     const userDataPath = app.getPath('userData');
//     const logPath = path.join(userDataPath, 'ScrapeForge_Boot_Log.txt');
    
//     // Simple Log Rotation: If file > 5MB, wipe it and start fresh
//     if (fs.existsSync(logPath)) {
//       const stats = fs.statSync(logPath);
//       if (stats.size > 5 * 1024 * 1024) { 
//         fs.renameSync(logPath, path.join(userDataPath, 'ScrapeForge_Boot_Log_OLD.txt'));
//       }
//     }
    
//     fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
//   } catch (e) {}
// }

// // 🚀 2. AGGRESSIVE GLOBAL CRASH HANDLERS
// process.on('uncaughtException', (err) => {
//   logToSystem(`[FATAL UNCAUGHT] ${err.message}\n${err.stack}`);
//   if (app.isReady()) {
//     dialog.showErrorBox('CRITICAL ENGINE CRASH', `The backend suffered a fatal crash:\n\n${err.message}`);
//   }
// });

// process.on('unhandledRejection', (reason: any) => {
//   logToSystem(`[FATAL PROMISE] ${reason?.message || reason}`);
//   if (reason && reason.message && reason.message.includes('Target page')) return; // Ignore harmless playwright closure
//   if (app.isReady()) {
//     dialog.showErrorBox('CRITICAL PROMISE CRASH', `An asynchronous task failed:\n\n${reason?.message || String(reason)}`);
//   }
// });

// logToSystem("=== NEW APPLICATION BOOT ===");

// // 🚀 3. SINGLE-INSTANCE LOCK
// const gotTheLock = app.requestSingleInstanceLock();

// if (!gotTheLock) {
//   logToSystem("Second instance detected. Quitting new process and focusing existing window.");
//   app.quit();
// } else {
//   app.on('second-instance', () => {
//     if (mainWindow) {
//       if (mainWindow.isMinimized()) mainWindow.restore();
//       mainWindow.focus();
//     }
//   });
// }

// let mainWindow: BrowserWindow | null = null;
// let isManualCheck = false;
// let backendModule: any = null; // Store reference for graceful shutdown

// // Auto-updater Settings
// autoUpdater.autoDownload = false;
// autoUpdater.autoInstallOnAppQuit = false;
// autoUpdater.allowDowngrade = false; 

// // 🚀 HELPER: Streams update status to the React UI
// const sendUpdateStatus = (status: string, info: any = null) => {
//   if (mainWindow && !mainWindow.isDestroyed()) {
//     mainWindow.webContents.send('update-status', { status, info });
//   }
// };

// function setupAutoUpdater(win: BrowserWindow) {
//   autoUpdater.on('checking-for-update', () => sendUpdateStatus('CHECKING'));
  
//   autoUpdater.on('update-available', (info) => {
//     sendUpdateStatus('AVAILABLE', info);
//     autoUpdater.downloadUpdate(); // Trigger background download automatically
//   });

//   autoUpdater.on('update-not-available', (info) => {
//     sendUpdateStatus('NOT_AVAILABLE', info);
    
//     // Only show popup if they clicked the native menu bar option
//     if (isManualCheck && mainWindow) {
//       dialog.showMessageBox(mainWindow, {
//         type: 'info',
//         title: 'Up to Date',
//         message: 'ScrapeForge is already up to date!',
//         detail: `You are running the latest version: ${app.getVersion()}`
//       });
//       isManualCheck = false;
//     }
//   });

//   autoUpdater.on('error', (err) => sendUpdateStatus('ERROR', err.message));

//   autoUpdater.on('download-progress', (progressObj) => {
//     sendUpdateStatus('DOWNLOADING', progressObj.percent);
//     // Backward compatibility for existing listeners
//     if (mainWindow) mainWindow.webContents.send('updater-progress', Math.round(progressObj.percent));
//   });

//   autoUpdater.on('update-downloaded', (info) => {
//     sendUpdateStatus('DOWNLOADED', info);
    
//     // Fallback native dialog for installation
//     dialog.showMessageBox(win, {
//       type: 'info',
//       title: 'Update Ready to Install',
//       message: `A new version of ScrapeForge (${info.version}) has been downloaded!`,
//       detail: 'Would you like to restart and apply the update now?',
//       buttons: ['Restart & Update', 'Later'],
//       defaultId: 0,
//       cancelId: 1,
//     }).then((result) => {
//       if (result.response === 0) {
//         isQuitting = true; // Bypass graceful shutdown to allow updater to close app
//         autoUpdater.quitAndInstall();
//       }
//     });
//   });
// }

// async function checkUpdatesAction(win?: BrowserWindow) {
//   try {
//     await autoUpdater.checkForUpdates();
//   } catch (err: any) {
//     sendUpdateStatus('ERROR', err.message);
//     if (win && isManualCheck) {
//       dialog.showErrorBox(
//         'Update Check Failed', 
//         'Could not check for updates. Make sure you are connected to the internet.\n\nDetails: ' + err.message
//       );
//     }
//     isManualCheck = false;
//   }
// }

// function handleUninstall() {
//   if (!mainWindow) return;

//   dialog.showMessageBox(mainWindow, {
//     type: 'warning',
//     title: 'Uninstall ScrapeForge',
//     message: 'Are you sure you want to uninstall ScrapeForge?',
//     detail: 'This will close the application and launch the system uninstaller.',
//     buttons: ['Cancel', 'Uninstall Now'],
//     defaultId: 0,
//     cancelId: 0
//   }).then((result) => {
//     if (result.response === 1) {
//       isQuitting = true; // Bypass graceful shutdown for uninstaller
//       if (process.platform === 'win32') {
//         const uninstallerPath = path.join(process.execPath, '../../Uninstall ScrapeForge.exe');
//         if (fs.existsSync(uninstallerPath)) {
//           cp.spawn(uninstallerPath, { detached: true, stdio: 'ignore' }).unref();
//           app.quit();
//         } else {
//           shell.openExternal('ms-settings:appsfeatures');
//           app.quit();
//         }
//       } else if (process.platform === 'darwin') {
//         dialog.showMessageBox(mainWindow!, {
//           type: 'info',
//           title: 'Uninstall on macOS',
//           message: 'To uninstall ScrapeForge, simply drag the application from your Applications folder to the Trash.'
//         });
//       } else {
//         dialog.showMessageBox(mainWindow!, {
//           type: 'info',
//           title: 'Uninstall on Linux',
//           message: 'Please use your Linux distribution package manager or remove the AppImage file manually.'
//         });
//       }
//     }
//   });
// }

// function setupNativeMenu() {
//   const template = [
//     {
//       label: 'Help',
//       submenu: [
//         {
//           label: 'Check for Updates...',
//           click: async () => {
//             isManualCheck = true;
//             if (mainWindow) {
//               await checkUpdatesAction(mainWindow);
//             }
//           }
//         },
//         { type: 'separator' },
//         {
//           label: 'Uninstall ScrapeForge...',
//           click: () => {
//             handleUninstall();
//           }
//         },
//         { type: 'separator' },
//         {
//           label: 'About ScrapeForge',
//           click: () => {
//             if (mainWindow) {
//               dialog.showMessageBox(mainWindow, {
//                 type: 'info',
//                 title: 'About ScrapeForge',
//                 message: 'ScrapeForge Engine',
//                 detail: `Version: ${app.getVersion()}\nPowered by VSS Gowri Tech Online Private Limited.`,
//                 buttons: ['OK', 'Visit Website'],
//                 defaultId: 0
//               }).then((result) => {
//                 if (result.response === 1) {
//                   shell.openExternal('https://vssgowritechonline.com');
//                 }
//               });
//             }
//           }
//         }
//       ]
//     }
//   ];

//   const menu = Menu.buildFromTemplate(template as any);
//   Menu.setApplicationMenu(menu);
// }

// function createWindow() {
//   const iconPath = path.join(__dirname, '../../dist/Gemini_Generated_Image_u6aa2ku6aa2ku6aa.png');

//   mainWindow = new BrowserWindow({
//     width: 1400,
//     height: 900,
//     backgroundColor: '#020617',
//     icon: fs.existsSync(iconPath) ? iconPath : undefined,
//     webPreferences: {
//       nodeIntegration: false,
//       contextIsolation: true,
//       preload: path.join(__dirname, 'preload.js'),
//     },
//   });

//   setupNativeMenu();
//   mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

//   mainWindow.webContents.on('before-input-event', (event, input) => {
//     if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
//       mainWindow.setFullScreen(false);
//       event.preventDefault(); 
//     }
//   });

//   mainWindow.once('ready-to-show', () => {
//     if (mainWindow) {
//       setupAutoUpdater(mainWindow);
      
//       // Auto-trigger a silent update check 5 seconds after boot
//       setTimeout(() => {
//         checkUpdatesAction();
//       }, 5000);
//     }
//   });
// }

// // IPC Handle for Renderer update calls
// ipcMain.handle('check-for-updates', async () => {
//   if (mainWindow) {
//     await checkUpdatesAction(mainWindow);
//   }
//   return { success: true };
// });

// // 🚀 4. WAIT FOR APP TO BE READY BEFORE BOOTING BACKEND
// app.whenReady().then(async () => {
//   logToSystem(`Electron app.whenReady fired. Directory: ${__dirname}`);
  
//   // 🚀 BOOT THE EXPRESS BACKEND & PASS PORT TO RENDERER
//   try {
//     logToSystem(`Attempting to require('../index')...`);
//     backendModule = require('../index'); 
//     logToSystem(`Express backend successfully loaded!`);

//     // Listen for backend port assignment once window is created
//     ipcMain.handle('get-backend-port', () => {
//       return backendModule.activeServerPort || 4000;
//     });
//   } catch (err: any) {
//     logToSystem(`[FATAL CRASH] Failed to load backend: ${err.message}\n${err.stack}`);
//     dialog.showErrorBox(
//       "CRITICAL BACKEND CRASH", 
//       "The Express backend failed to compile or load.\n\nError: " + err.message + "\n\nStack: " + err.stack
//     );
//   }

//   createWindow();

//   app.on('activate', () => {
//     if (BrowserWindow.getAllWindows().length === 0) createWindow();
//   });
// });

// // 🚀 5. GRACEFUL SHUTDOWN INTERCEPTOR (Zombie Process Killer)
// let isQuitting = false;

// app.on('before-quit', async (event) => {
//   if (!isQuitting) {
//     event.preventDefault(); // Stop the app from quitting immediately
//     isQuitting = true;
    
//     logToSystem("Initiating graceful shutdown sequence...");
    
//     try {
//       // If your Express index.ts exports a shutdown() function, we call it here to kill Chromium
//       if (backendModule && typeof backendModule.shutdown === 'function') {
//         await backendModule.shutdown();
//         logToSystem("Backend shut down successfully.");
//       } else {
//         logToSystem("No graceful shutdown function found on backend, closing immediately.");
//       }
//     } catch (e: any) {
//       logToSystem(`Error during shutdown: ${e.message}`);
//     }

//     app.quit(); // Now safely quit the Electron shell
//   }
// });

// app.on('window-all-closed', () => {
//   if (process.platform !== 'darwin') {
//     app.quit(); // This triggers 'before-quit' above
//   }
// });

import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

// 🚀 1. GUARANTEED SYSTEM LOGGER (With 5MB Auto-Rotation)
function logToSystem(msg: string) {
  try {
    const userDataPath = app.getPath('userData');
    const logPath = path.join(userDataPath, 'ScrapeForge_Boot_Log.txt');

    // Simple Log Rotation: If file > 5MB, wipe it and start fresh
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > 5 * 1024 * 1024) {
        fs.renameSync(logPath, path.join(userDataPath, 'ScrapeForge_Boot_Log_OLD.txt'));
      }
    }

    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

// 🚀 2. AGGRESSIVE GLOBAL CRASH HANDLERS
process.on('uncaughtException', (err) => {
  logToSystem(`[FATAL UNCAUGHT] ${err.message}\n${err.stack}`);
  if (app.isReady()) {
    dialog.showErrorBox('CRITICAL ENGINE CRASH', `The backend suffered a fatal crash:\n\n${err.message}`);
  }
});
process.on('unhandledRejection', (reason: any) => {
  logToSystem(`[FATAL PROMISE] ${reason?.message || reason}`);
  if (reason && reason.message && reason.message.includes('Target page')) return; // Ignore harmless playwright closure
  if (app.isReady()) {
    dialog.showErrorBox('CRITICAL PROMISE CRASH', `An asynchronous task failed:\n\n${reason?.message || String(reason)}`);
  }
});

logToSystem("=== NEW APPLICATION BOOT ===");

// 🚀 3. SINGLE-INSTANCE LOCK
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logToSystem("Second instance detected. Quitting new process and focusing existing window.");
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let isManualCheck = false;
let backendModule: any = null; // Store reference for graceful shutdown

// Auto-updater Settings
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.allowDowngrade = false;

// 🚀 HELPER: Streams update status to the React UI
const sendUpdateStatus = (status: string, info: any = null) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, info });
  }
};

function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.on('checking-for-update', () => sendUpdateStatus('CHECKING'));

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('AVAILABLE', info);
    autoUpdater.downloadUpdate(); // Trigger background download automatically
  });
  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus('NOT_AVAILABLE', info);

    // Only show popup if they clicked the native menu bar option
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
  autoUpdater.on('error', (err) => sendUpdateStatus('ERROR', err.message));
  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdateStatus('DOWNLOADING', progressObj.percent);
    // Backward compatibility for existing listeners
    if (mainWindow) mainWindow.webContents.send('updater-progress', Math.round(progressObj.percent));
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('DOWNLOADED', info);

    // Fallback native dialog for installation
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
        isQuitting = true; // Bypass graceful shutdown to allow updater to close app
        autoUpdater.quitAndInstall();
      }
    });
  });
}

async function checkUpdatesAction(win?: BrowserWindow) {
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    sendUpdateStatus('ERROR', err.message);
    if (win && isManualCheck) {
      dialog.showErrorBox(
        'Update Check Failed',
        'Could not check for updates. Make sure you are connected to the internet.\n\nDetails: ' + err.message
      );
    }
    isManualCheck = false;
  }
}

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
      isQuitting = true; // Bypass graceful shutdown for uninstaller
      if (process.platform === 'win32') {
        const uninstallerPath = path.join(process.execPath, '../../Uninstall ScrapeForge.exe');
        if (fs.existsSync(uninstallerPath)) {
          cp.spawn(uninstallerPath, { detached: true, stdio: 'ignore' }).unref();
          app.quit();
        } else {
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

function setupNativeMenu() {
  const template = [
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: async () => {
            isManualCheck = true;
            if (mainWindow) {
              await checkUpdatesAction(mainWindow);
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
  const iconPath = path.join(__dirname, '../../dist/Gemini_Generated_Image_u6aa2ku6aa2ku6aa.png');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#020617',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  setupNativeMenu();
  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false);
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      setupAutoUpdater(mainWindow);

      // Auto-trigger a silent update check 5 seconds after boot
      setTimeout(() => {
        checkUpdatesAction();
      }, 5000);
    }
  });
}

// IPC Handle for Renderer update calls
ipcMain.handle('check-for-updates', async () => {
  if (mainWindow) {
    await checkUpdatesAction(mainWindow);
  }
  return { success: true };
});

// 🚀 4. WAIT FOR APP TO BE READY BEFORE BOOTING BACKEND
app.whenReady().then(async () => {
  logToSystem(`Electron app.whenReady fired. Directory: ${__dirname}`);

  // 🚀 BOOT THE EXPRESS BACKEND & PASS PORT TO RENDERER
  try {
    logToSystem(`Attempting to require('../index')...`);
    backendModule = require('../index');
    logToSystem(`Express backend successfully loaded!`);

    // Listen for backend port assignment once window is created
    ipcMain.handle('get-backend-port', () => {
      // 🚀 FIXED: index.ts's `activeServerPort` was a plain mutable `let`, never exported — so
      // `backendModule.activeServerPort` was always `undefined` here, and this handler silently
      // fell back to a hardcoded 4000 regardless of which port the backend's auto-iterating startup
      // logic (4000 -> 4009) actually bound to. Harmless in the common case where 4000 is free, but
      // silently wrong the moment it isn't (e.g. a second instance, or something else on 4000).
      // index.ts now exports `getActiveServerPort()` instead of the bare variable.
      if (typeof backendModule.getActiveServerPort === 'function') {
        return backendModule.getActiveServerPort();
      }
      // Fallback for an older/stale backend build that doesn't export the getter yet.
      return backendModule.activeServerPort || 4000;
    });
  } catch (err: any) {
    logToSystem(`[FATAL CRASH] Failed to load backend: ${err.message}\n${err.stack}`);
    dialog.showErrorBox(
      "CRITICAL BACKEND CRASH",
      "The Express backend failed to compile or load.\n\nError: " + err.message + "\n\nStack: " + err.stack
    );
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 🚀 5. GRACEFUL SHUTDOWN INTERCEPTOR (Zombie Process Killer)
let isQuitting = false;
app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault(); // Stop the app from quitting immediately
    isQuitting = true;

    logToSystem("Initiating graceful shutdown sequence...");

    try {
      // If your Express index.ts exports a shutdown() function, we call it here to kill Chromium
      if (backendModule && typeof backendModule.shutdown === 'function') {
        await backendModule.shutdown();
        logToSystem("Backend shut down successfully.");
      } else {
        logToSystem("No graceful shutdown function found on backend, closing immediately.");
      }
    } catch (e: any) {
      logToSystem(`Error during shutdown: ${e.message}`);
    }
    app.quit(); // Now safely quit the Electron shell
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit(); // This triggers 'before-quit' above
  }
});