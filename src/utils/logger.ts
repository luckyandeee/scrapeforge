import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const systemEvents = new EventEmitter();

// 🚀 DIRECT DESKTOP LOGGER (No OneDrive pathing)
function writeTelemetry(msg: string) {
  try {
    const desktopPath = path.join(os.homedir(), 'Desktop', 'ScrapeForge_Telemetry.txt');
    fs.appendFileSync(desktopPath, `${msg}\n`);
  } catch (e) {
    console.error("Failed to write to desktop:", e);
  }
}

export const broadcast = (level: 'info' | 'success' | 'warning' | 'error', message: string, source: string = 'System') => {
    const prefix = level === 'error' ? '❌' : level === 'success' ? '✅' : level === 'warning' ? '⚠️' : '➡️';
    const logMessage = `${prefix} [${source}] ${message}`;
    
    // 1. Log to hidden console
    console.log(logMessage);
    
    // 2. Force log to physical Desktop file
    writeTelemetry(`[${new Date().toISOString()}] ${logMessage}`);

    // 3. Emit to React UI via EventSource
    systemEvents.emit('stream', {
        timestamp: new Date().toISOString(),
        level,
        source,
        message
    });
};