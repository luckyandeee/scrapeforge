import { spawn, execSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

const OLLAMA_PORT = 11434;

// 1. Hardware Check (Minimum 8GB RAM, 64-bit OS)
export function checkHardwareSpecs(): { isCapable: boolean; reason?: string } {
  const totalRamGB = os.totalmem() / (1024 ** 3);
  const arch = os.arch();

  if (arch !== 'x64' && arch !== 'arm64') {
    return { isCapable: false, reason: '64-bit architecture required.' };
  }
  // Allow slightly less than 8GB to account for hardware-reserved RAM
  if (totalRamGB < 7.0) {
    return { isCapable: false, reason: `Minimum 8GB RAM required (Detected: ${totalRamGB.toFixed(1)}GB).` };
  }

  return { isCapable: true };
}

// 2. Check if Ollama HTTP server is currently running
export function checkOllamaRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${OLLAMA_PORT}/api/tags`, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// 3. Locate Ollama executable
export function findOllamaPath(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    const resolvedPath = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
    if (resolvedPath && fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  } catch (e) {
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const defaultPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
      if (fs.existsSync(defaultPath)) {
        return defaultPath;
      }
    }
  }
  return null;
}

// 4. Main initialization sequence
export async function ensureOllamaRunning(): Promise<{ success: boolean; code: string; message: string }> {
  const hardware = checkHardwareSpecs();
  if (!hardware.isCapable) {
    return { success: false, code: 'UNSUPPORTED', message: hardware.reason || 'Hardware not supported' };
  }

  const isRunning = await checkOllamaRunning();
  if (isRunning) {
    return { success: true, code: 'RUNNING', message: 'Ollama is running.' };
  }

  const ollamaPath = findOllamaPath();
  if (!ollamaPath) {
    return {
      success: false,
      code: 'MISSING',
      message: 'Ollama is not installed on this machine.',
    };
  }

  try {
    const subprocess = spawn(ollamaPath, ['serve'], { detached: true, stdio: 'ignore' });
    subprocess.unref();

    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await checkOllamaRunning()) {
        return { success: true, code: 'RUNNING', message: 'Ollama started successfully.' };
      }
    }

    return { success: false, code: 'ERROR', message: 'Ollama process started but failed to respond.' };
  } catch (error: any) {
    return { success: false, code: 'ERROR', message: `Failed to launch Ollama: ${error.message}` };
  }
}

// 5. Download and Install Ollama
export function downloadAndInstallOllama(onProgress: (percent: number) => void): Promise<{ success: boolean; code: string; message: string }> {
  return new Promise((resolve) => {
    const hardware = checkHardwareSpecs();
    if (!hardware.isCapable) {
      resolve({ success: false, code: 'UNSUPPORTED', message: 'Hardware does not meet minimum requirements for installation.' });
      return;
    }

    const installerUrl = 'https://ollama.com/download/OllamaSetup.exe';
    const tempPath = path.join(os.tmpdir(), 'ScrapeForge_OllamaSetup.exe');
    const file = fs.createWriteStream(tempPath);

    const req = https.get(installerUrl, (response) => {
      if (response.statusCode !== 200) {
        resolve({ success: false, code: 'ERROR', message: `Download failed with status ${response.statusCode}` });
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          onProgress(Math.round((downloadedBytes / totalBytes) * 100));
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        try {
          const installerProcess = spawn(tempPath, [], { detached: true, stdio: 'ignore' });
          installerProcess.unref();
          resolve({ success: true, code: 'INSTALLING', message: 'Installer launched. Complete setup to enable AI.' });
        } catch (e: any) {
          resolve({ success: false, code: 'ERROR', message: `Failed to launch installer: ${e.message}` });
        }
      });
    });

    req.on('error', (e) => {
      fs.unlink(tempPath, () => {});
      resolve({ success: false, code: 'ERROR', message: `Network error: ${e.message}` });
    });
  });
}