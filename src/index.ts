import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

const isProduction = process.env.NODE_ENV === 'production' || (typeof process.resourcesPath === 'string' && !process.execPath.includes('node_modules'));
const envPath = isProduction 
  ? path.join(process.resourcesPath, '.env') 
  : path.resolve(process.cwd(), '.env');

console.log(`🔍 [Config Debug] Looking for .env at: ${envPath}`);
console.log(`🔍 [Config Debug] File exists? ${fs.existsSync(envPath)}`);

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error(`❌ [Config Debug] Dotenv failed to load:`, result.error.message);
} else {
  console.log(`✅ [Config Debug] Dotenv loaded successfully.`);
}

import { writeDebug } from "./db/sqlite";
import { execSync } from "child_process";
import os from "os";
import { ipcMain, BrowserWindow } from "electron";
import { ACTIVE_HARDWARE_PROFILE } from "./utils/hardware";

// 🛡️ INSTANCE LIMITER: Enforces a strict maximum of 10 concurrent app processes
const enforceInstanceLimit = () => {
  try {
    const platform = process.platform;
    let cmd = "";
    if (platform === "win32") {
      cmd = 'tasklist /fi "imagename eq node.exe" /fo csv 2>nul | find /i "scrapeforge" /c';
    } else {
      cmd = 'ps aux | grep "[s]crapeforge" | wc -l';
    }

    const output = execSync(cmd).toString().trim();
    const activeCount = parseInt(output, 10) || 0;
    if (activeCount >= 10) {
      console.error(`❌ MAXIMUM INSTANCE LIMIT REACHED (10/10). Additional app launch blocked.`);
      process.exit(1);
    }
  } catch {}
};
enforceInstanceLimit();

// 🛡️ THE GLOBAL ANTI-CRASH SHIELD
process.on("uncaughtException", (err) => {
  writeDebug(`🔥 CRITICAL Uncaught Exception: ${err.message}\n${err.stack}`);
  console.error("\n🔥 CRITICAL: Uncaught Exception intercepted. Engine surviving.", err.message);
});
process.on('unhandledRejection', (reason: any) => {
  if (reason && reason.message && reason.message.includes('Target page, context or browser has been closed')) return;
  writeDebug(`🔥 CRITICAL Unhandled Rejection: ${reason?.stack || reason}`);
  console.error('🔥 CRITICAL Unhandled Rejection:', reason);
});

writeDebug("5. Express Engine Booting...");
import express from "express";
import cors from "cors";
import { db, queries, getHighValueCount } from "./db/sqlite";
import { startNetworkMonitor } from "./utils/network";
import { discoverBusinesses } from "./collectors/discovery";
import { startEnrichmentWorker } from "./workers/enrichment";
import { broadcast, systemEvents } from "./utils/logger";
import { getCleanContext } from "./utils/browser";
// 🚀 RESTORED: Social Session Managers
import { verifySocialSessions, getSocialAccountStatuses, connectSocialAccount, disconnectSocialAccount } from "./collectors/social";
import type { BrowserContext } from "playwright";

// 🚀 INSTANT FLUSH: Resets all stuck or crashed leads back to the correct active queue
db.prepare("UPDATE businesses SET status = 'pending_verification' WHERE status IN ('processing', 'pending')").run();

// 🚀 ENHANCED GLOBAL STATE (Dynamic Power Modes Integrated)
export const globalState = {
  isDiscoveryPaused: true,
  isEnrichmentPaused: true,
  isDiscoveryActive: false,
  killSignal: false,
  targetLeadCount: 0,
  activeCampaign: "STANDBY",
  activeProfession: "STANDBY",
  activeLocation: "STANDBY",
  contactRequirement: "any",
  userPreferredMode: ACTIVE_HARDWARE_PROFILE?.tier === "LOW",
  lowPowerMode: ACTIVE_HARDWARE_PROFILE?.tier === "LOW",
  isAutoThrottled: false,
  isAutoPaused: false
};

// 🚀 IPC EMITTER TO FRONTEND (Live React UI Updates)
const notifyFrontend = (channel: string, payload: any) => {
  try {
    if (typeof BrowserWindow !== 'undefined' && BrowserWindow.getAllWindows) {
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      });
    }
  } catch (e) {}
  
  if (channel === 'system-status-change') {
    try {
      systemEvents.emit('stream', { __type: 'system-status', ...payload });
    } catch (e) {}
  }
};

// 🚀 AUTONOMOUS RESOURCE MONITOR & AUTO-HALTER
const startDynamicResourceMonitor = () => {
  setInterval(() => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const freeMemPercent = (freeMem / totalMem) * 100;
    const freeMemGB = freeMem / (1024 * 1024 * 1024);
    
    const isCritical = freeMemPercent < 5 || freeMemGB < 0.5;
    const isStressed = freeMemPercent < 15 || freeMemGB < 1.5;
    const isRecovering = freeMemPercent > 10 && freeMemGB > 1.0;
    const isHealthy = freeMemPercent > 25 && freeMemGB > 2.5;
    
    if (isCritical && !globalState.isAutoPaused) {
      globalState.isDiscoveryPaused = true;
      globalState.isAutoPaused = true;
      broadcast("error", `🚨 CRITICAL RAM DEPLETION (${freeMemGB.toFixed(2)}GB free). Auto-halting all spiders to protect OS.`, "System");
      notifyFrontend('system-status-change', { state: 'CRITICAL_PAUSE', freeMemGB, mode: 'Paused' });
      return;
    }
    
    if (globalState.isAutoPaused && isRecovering) {
      if (globalState.activeCampaign !== "STANDBY") globalState.isDiscoveryPaused = false;
      globalState.isAutoPaused = false;
      globalState.lowPowerMode = true;
      globalState.isAutoThrottled = true;
      broadcast("info", `♻️ Resources recovering (${freeMemGB.toFixed(2)}GB free). Resuming spiders in ECO Mode.`, "System");
      notifyFrontend('system-status-change', { state: 'RESUMED_ECO', freeMemGB, mode: 'Eco' });
    }
    
    if (isStressed && !globalState.isAutoPaused && !globalState.lowPowerMode) {
      globalState.lowPowerMode = true;
      globalState.isAutoThrottled = true;
      broadcast("warning", `⚠️ System stressed (${freeMemGB.toFixed(2)}GB free). Auto-throttling engine to ECO Mode.`, "System");
      notifyFrontend('system-status-change', { state: 'THROTTLED_ECO', freeMemGB, mode: 'Eco' });
    }
    
    if (isHealthy && !globalState.isAutoPaused && globalState.isAutoThrottled) {
      if (!globalState.userPreferredMode && ACTIVE_HARDWARE_PROFILE?.tier !== "LOW") {
        globalState.lowPowerMode = false;
      }
      globalState.isAutoThrottled = false;
      broadcast("success", `⚡ System healthy (${freeMemGB.toFixed(2)}GB free). Engine auto-throttle released.`, "System");
      notifyFrontend('system-status-change', { state: 'THROTTLE_RELEASED', freeMemGB, mode: globalState.lowPowerMode ? 'Eco' : 'Performance' });
    }
  }, 10000);
};
startDynamicResourceMonitor();

// ==========================================
// 🚀 IPC HANDLERS FOR FRONTEND STATE
// ==========================================
if (typeof ipcMain !== 'undefined' && ipcMain.handle) {
  ipcMain.handle("get-hardware-profile", () => {
    return {
      profile: ACTIVE_HARDWARE_PROFILE,
      isLowPowerLocked: ACTIVE_HARDWARE_PROFILE?.tier === "LOW",
      currentMode: globalState.lowPowerMode,
      isAutoThrottled: globalState.isAutoThrottled,
      isAutoPaused: globalState.isAutoPaused
    };
  });
  ipcMain.handle("set-power-mode", (event, isEcoMode: boolean) => {
    if (globalState.isAutoPaused || (globalState.isAutoThrottled && !isEcoMode)) {
      broadcast("warning", "Manual override rejected: System is actively recovering from heavy load.", "System");
      return { mode: globalState.lowPowerMode, blocked: true };
    }
    if (ACTIVE_HARDWARE_PROFILE?.tier === "LOW" && !isEcoMode) {
      broadcast("warning", "Hardware lock active: High Power Mode is disabled.", "System");
      globalState.userPreferredMode = true;
      globalState.lowPowerMode = true;
      return { mode: true, blocked: true };
    }
    globalState.userPreferredMode = isEcoMode;
    globalState.lowPowerMode = isEcoMode;
    globalState.isAutoThrottled = false;
    broadcast("info", `Power mode manually switched to: ${isEcoMode ? 'ECO' : 'PERFORMANCE'}`, "System");
    return { mode: globalState.lowPowerMode, blocked: false };
  });
} else {
  broadcast("info", "Engine running in Pure Node.js mode (Electron IPC matrix bypassed).", "System");
}

const app = express();

const ALLOWED_LOCAL_PORT_RANGES: Array<[number, number]> = [
  [5173, 5199],
  [4000, 4019],
];
const isAllowedOrigin = (origin?: string | null): boolean => {
  if (!origin) return true;
  if (!/^https?:\/\//i.test(origin)) return true;
  const match = origin.match(/^https?:\/\/localhost:(\d+)$/) || origin.match(/^https?:\/\/127\.0\.0\.1:(\d+)$/);
  if (!match) return false;
  const port = parseInt(match[1], 10);
  return ALLOWED_LOCAL_PORT_RANGES.some(([lo, hi]) => port >= lo && port <= hi);
};
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error(`ScrapeForge CORS: origin "${origin}" is not on the allowlist.`));
  }
}));

app.use(express.json());

// 🚀 REAL-TIME CPU CALCULATOR
const getCpuTimes = () => {
  const cpus = os.cpus();
  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  return { idle, total: user + nice + sys + idle + irq };
};
const calculateCpuUsage = async (): Promise<number> => {
  const t1 = getCpuTimes();
  await new Promise((r) => setTimeout(r, 200));
  const t2 = getCpuTimes();
  const idleDiff = t2.idle - t1.idle;
  const totalDiff = t2.total - t1.total;
  return totalDiff === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100 - (100 * idleDiff) / totalDiff)));
};

// 🚀 LIVE METRICS API
app.get("/api/system/metrics", async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuPercent = await calculateCpuUsage();
    res.json({
      success: true,
      data: {
        cpuPercent,
        usedMemGB: (usedMem / (1024 ** 3)).toFixed(1),
        totalMemGB: Math.round(totalMem / (1024 ** 3)),
        freeMemGB: (freeMem / (1024 ** 3)).toFixed(1),
        ramPercent: Math.round((usedMem / totalMem) * 100),
        powerMode: globalState.lowPowerMode ? "ECO" : "PERFORMANCE",
        isAutoThrottled: globalState.isAutoThrottled,
        isAutoPaused: globalState.isAutoPaused,
        tier: ACTIVE_HARDWARE_PROFILE?.tier || "UNKNOWN"
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export const autoHaltEngine = () => {
    if (globalState.activeProfession === "STANDBY") return;

    globalState.killSignal = true;
    globalState.activeProfession = "STANDBY";
    globalState.activeLocation = "STANDBY";
    globalState.activeCampaign = "STANDBY";
    globalState.isDiscoveryPaused = true;
    globalState.isEnrichmentPaused = true;

    console.log("[System] 🎯 TARGET LIMIT SECURED. Auto-halting all engines and returning to STANDBY.");
};

// --- CAMPAIGN CRUD ---
app.get("/api/campaigns", (req, res) => {
  try {
    const campaigns = queries.getCampaigns.all();
    res.json({ success: true, data: campaigns.map((c: any) => c.campaign_name) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete("/api/campaigns/:name", (req, res) => {
  try {
    queries.deleteCampaign(req.params.name);
    if (globalState.activeCampaign === req.params.name) {
      globalState.activeCampaign = "STANDBY";
      globalState.activeProfession = "STANDBY";
      globalState.activeLocation = "STANDBY";
      globalState.isDiscoveryActive = false;
    }
    globalState.isDiscoveryPaused = true;
    globalState.isEnrichmentPaused = true;
    globalState.killSignal = true;
    res.json({ success: true, message: `Campaign purged. Ghost processes terminated.` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- FILTERED DATA FETCHING ---
app.get("/api/businesses", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const status = (req.query.status as string) || "all";
    const campaign = (req.query.campaign as string) || "all";
    const offset = (page - 1) * limit;
    let queryStr = `SELECT * FROM businesses WHERE 1=1`;
    const params: any[] = [];
    if (status !== "all") {
      queryStr += ` AND status = ?`;
      params.push(status);
    }
    if (campaign !== "all") {
      queryStr += ` AND campaign_name = ?`;
      params.push(campaign);
    }
    queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const stmt = db.prepare(queryStr);
    const records = stmt.all(...params);
    res.json({ success: true, count: records.length, data: records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/stats", (req, res) => {
  try {
    const campaign = (req.query.campaign as string) || "all";
    const campFilter = campaign === "all" ? "%" : campaign;
    const baseStats = (db.prepare(`
      SELECT
        COUNT(id) as total,
        SUM(CASE WHEN status IN ('pending_verification', 'processing') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed
      FROM businesses
      WHERE campaign_name LIKE ?
    `).get(campFilter) as any) || { total: 0, pending: 0, processed: 0 };

    const highValue = getHighValueCount(campaign === "all" ? "%" : campaign, globalState.contactRequirement);
    const phonesEmailsStmt = db.prepare(`
      SELECT
        SUM(CASE WHEN phone IS NOT NULL AND TRIM(phone) != '' AND LOWER(TRIM(phone)) NOT IN ('not found','null','undefined','-') THEN 1 ELSE 0 END) as phones,
        SUM(CASE WHEN email IS NOT NULL AND TRIM(email) != '' AND LOWER(TRIM(email)) NOT IN ('not found','null','undefined','-') THEN 1 ELSE 0 END) as emails
      FROM businesses
      WHERE campaign_name LIKE ? AND status = 'processed'
    `).get(campFilter) as any;

    const sourceRows = db.prepare(`
      SELECT source FROM businesses WHERE campaign_name LIKE ? AND status = 'processed'
    `).all(campFilter) as any[];
    const sources: Record<string, number> = {};
    sourceRows.forEach((row) => {
      const s = row.source ? String(row.source) : "Unknown";
      s.split(",").forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) sources[trimmed] = (sources[trimmed] || 0) + 1;
      });
    });

    res.json({
      success: true,
      data: {
        total: baseStats.total || 0,
        pending: baseStats.pending || 0,
        processed: baseStats.processed || 0,
        highValue: highValue || 0,
        phones: (phonesEmailsStmt && phonesEmailsStmt.phones) || 0,
        emails: (phonesEmailsStmt && phonesEmailsStmt.emails) || 0,
        sources,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🚀 GLOBAL LOG BUFFER
const logHistory: any[] = [];
systemEvents.on("stream", (data: any) => {
  logHistory.push(data);
  if (logHistory.length > 50) logHistory.shift(); 
});
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  logHistory.forEach(data => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
  
  const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  systemEvents.on("stream", sendEvent);

  req.on("close", () => systemEvents.off("stream", sendEvent));
});

// --- ENGINE CONTROL PANEL ROUTES ---
app.post("/api/control/enrichment/resume", (req, res) => {
  globalState.isEnrichmentPaused = false;
  broadcast("success", "Deterministic Enrichment Engine Online and draining buffer...", "System");
  res.json({ success: true, message: "Enrichment Resumed" });
});
app.post("/api/control/enrichment/pause", (req, res) => {
  globalState.isEnrichmentPaused = true;
  broadcast("warning", "Deterministic Enrichment Engine Paused.", "System");
  res.json({ success: true, message: "Enrichment Paused" });
});
app.post("/api/control/discovery/resume", (req, res) => {
  globalState.isDiscoveryPaused = false;
  globalState.killSignal = false;
  const { campaign_name, profession, location, limit } = req.body;
  if (campaign_name && profession && location) {
    globalState.activeCampaign = campaign_name;
    globalState.activeProfession = profession;
    globalState.activeLocation = location;
    globalState.targetLeadCount = limit ? parseInt(String(limit), 10) : 0;
  }
  if (!globalState.isDiscoveryActive && globalState.activeCampaign !== "STANDBY" && globalState.activeCampaign !== "") {
    globalState.isDiscoveryActive = true;
    discoverBusinesses(
      globalState.activeCampaign,
      globalState.activeProfession,
      globalState.activeLocation,
      globalState.targetLeadCount,
      globalState.lowPowerMode 
    ).catch(err => console.error("Spider Crash:", err)).finally(() => globalState.isDiscoveryActive = false);
  }
  broadcast("success", `Discovery Spiders Online and hunting for [${globalState.activeCampaign}]...`, "System");
  res.json({ success: true, message: "Discovery Resumed" });
});
app.post("/api/control/discovery/pause", (req, res) => {
  globalState.isDiscoveryPaused = true;
  broadcast("warning", "Discovery Spiders Paused.", "System");
  res.json({ success: true, message: "Discovery Paused" });
});
app.post("/api/scrape/discover", async (req, res) => {
  const { campaign_name, profession, location, limit, requirement = "any" } = req.body;
  if (!campaign_name || !profession || !location)
    return res.status(400).json({ success: false, error: "Missing data" });
  try {
    globalState.killSignal = false;
    globalState.isDiscoveryPaused = false;
    globalState.isEnrichmentPaused = false;
    globalState.targetLeadCount = limit ? parseInt(String(limit), 10) : 0;
    globalState.contactRequirement = requirement;

    globalState.activeCampaign = String(campaign_name);
    globalState.activeProfession = String(profession);
    globalState.activeLocation = String(location);
    if (globalState.lowPowerMode) {
      broadcast("warning", "ECO MODE ENGAGED: Forcing sequential crawling.", "System");
    }
    if (!globalState.isDiscoveryActive) {
      globalState.isDiscoveryActive = true;
      discoverBusinesses(
        globalState.activeCampaign,
        globalState.activeProfession,
        globalState.activeLocation,
        globalState.targetLeadCount,
        globalState.lowPowerMode 
      ).catch((err) => console.error("🔥 Pipeline crashed in background:", err)).finally(() => globalState.isDiscoveryActive = false);
    }
    res.json({
      success: true,
      message: `Pipeline Initiated. Target: ${globalState.targetLeadCount === 0 ? "Unlimited" : globalState.targetLeadCount} leads.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post("/api/control/stop", (req, res) => {
  globalState.killSignal = true;
  globalState.isDiscoveryPaused = true;
  globalState.isEnrichmentPaused = true;
  globalState.activeCampaign = "STANDBY";
  globalState.activeProfession = "STANDBY";
  globalState.activeLocation = "STANDBY";
  res.json({ success: true, message: "Engine halted via kill signal." });
});
app.post("/api/businesses/batch-delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: "Invalid ID array." });
  try {
    const deleteTransaction = db.transaction((targetIds: number[]) => {
      for (const id of targetIds) queries.deleteBusiness.run(id);
    });
    deleteTransaction(ids);
    res.json({ success: true });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// 🚀 PREMIUM PDF EXPORT ENDPOINT
app.post("/api/scrape/export/pdf", async (req, res) => {
  const { campaign, ids } = req.body;
  let context: BrowserContext | null = null;
  try {
    let rawLeads = [];
    const cleanVal = (val: any, fallback: string = "") => {
      if (!val) return fallback;
      const str = String(val).trim();
      if (str.toLowerCase() === "not found" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined" || str === "") { return fallback; }
      return str;
    };
    if (ids && ids.length > 0) {
      const placeholders = ids.map(() => "?").join(",");
      rawLeads = db.prepare(`SELECT name, phone, email, address, city, state, country, executive_names, industry, profession, website, source, social_links, ai_summary, status FROM businesses WHERE id IN (${placeholders}) ORDER BY name ASC`).all(...ids) as any[];
    } else {
      const campFilter = campaign && campaign !== "all" ? campaign : "%";
      rawLeads = db.prepare(`SELECT name, phone, email, address, city, state, country, executive_names, industry, profession, website, source, social_links, ai_summary, status FROM businesses WHERE campaign_name LIKE ? AND (status = 'processed' OR status = 'pending_verification') ORDER BY name ASC`).all(campFilter) as any[];
    }
    const leads = rawLeads.filter((lead) => cleanVal(lead.phone) !== "" || cleanVal(lead.email) !== "");
    if (leads.length === 0) return res.status(404).json({ error: "No high-fidelity contact data available for this selection." });
    
    const totalLeads = leads.length;
    const withPhone = leads.filter((l) => cleanVal(l.phone) !== "").length;
    const withEmail = leads.filter((l) => cleanVal(l.email) !== "").length;
    const sourceCounts = leads.reduce((acc, lead) => {
        const s = cleanVal(lead.source, "Unknown Engine");
        s.split(",").forEach((part) => {
          const trimmed = part.trim();
          if (trimmed) acc[trimmed] = (acc[trimmed] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>
    );
    const sourcesHtml = Object.entries(sourceCounts).map(([src, count]) => `<span class="badge" style="background: #e2e8f0; color: #334155; margin-right: 4px; margin-bottom: 4px;">${src}: ${count}</span>`).join("");
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                :root { --accent: #06b6d4; --text-main: #1e293b; --text-muted: #64748b; --border: #cbd5e1; }
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--text-main); margin: 0; padding: 30px; background: white; font-size: 10px; }
                .header { border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; }
                .header p { margin: 4px 0 0 0; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
                .summary-box { background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; padding: 12px 15px; margin-bottom: 25px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
                .summary-item { display: flex; flex-direction: column; }
                .summary-label { font-size: 8px; text-transform: uppercase; color: var(--text-muted); font-weight: 800; letter-spacing: 0.5px; margin-bottom: 3px; }
                .summary-val { font-size: 18px; font-weight: 900; color: var(--accent); }
                table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th { background-color: #f1f5f9; text-align: left; padding: 10px 8px; border-bottom: 2px solid #94a3b8; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
                td { padding: 12px 8px; border-bottom: 1px solid var(--border); vertical-align: top; line-height: 1.4; }
                .bold { font-weight: 700; color: #0f172a; font-size: 12px; }
                .badge { display: inline-block; padding: 2px 5px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 8px; text-transform: uppercase; color: #475569; margin-bottom: 3px; font-weight: 600; }
                .wa-badge { display: inline-block; padding: 2px 5px; background: #dcfce7; border: 1px solid #86efac; border-radius: 3px; font-size: 8px; color: #166534; font-weight: 700; margin-top: 2px; }
                .email { color: #0284c7; text-decoration: none; font-weight: 600; word-break: break-all; }
                .phone { color: #0f172a; font-weight: 700; }
                .social-list { font-size: 8px; color: #7c3aed; margin-top: 3px; font-family: monospace; }
                .footer { margin-top: 30px; text-align: center; font-size: 9px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>ScrapeForge Intelligence Matrix</h1>
                    <p>Campaign Sector: <strong>${campaign && campaign !== "all" ? campaign : "Global Export Matrix"}</strong></p>
                </div>
            </div>
            <div class="summary-box">
                <div class="summary-item"><span class="summary-label">High-Value Entities</span><span class="summary-val">${totalLeads}</span></div>
                <div class="summary-item"><span class="summary-label">Direct Phone Lines</span><span class="summary-val">${withPhone}</span></div>
                <div class="summary-item"><span class="summary-label">SMTP Coordinates</span><span class="summary-val">${withEmail}</span></div>
                <div class="summary-item"><span class="summary-label">Network Distribution</span><div style="margin-top: 4px; display: flex; flex-wrap: wrap;">${sourcesHtml}</div></div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 4%; text-align: center;">#</th>
                        <th style="width: 26%;">Target Entity & Executive</th>
                        <th style="width: 28%;">Contact Coordinates (Tel & SMTP)</th>
                        <th style="width: 24%;">Physical Location / Geofence</th>
                        <th style="width: 18%;">Sector Intelligence</th>
                    </tr>
                </thead>
                <tbody>
        `;
    leads.forEach((lead, index) => {
      const phoneStr = cleanVal(lead.phone, "No Phone");
      const emailStr = cleanVal(lead.email, "No Email");
      const execStr = cleanVal(lead.executive_names, "Unlisted");
      const addressStr = cleanVal(lead.address, cleanVal(lead.city, "Location Unlisted"));
      const industryStr = cleanVal(lead.industry, "General");
      const professionStr = cleanVal(lead.profession, "Business");
      const sourceStr = cleanVal(lead.source, "Direct Capture");
      const socialStr = cleanVal(lead.social_links);
      const websiteStr = cleanVal(lead.website);
      const summaryStr = cleanVal(lead.ai_summary);
      let waBadge = "";
      if (summaryStr.includes("WA:")) {
        const waMatch = summaryStr.match(/WA:\s*([^\s|]+)/);
        if (waMatch && waMatch[1]) { waBadge = `<div class="wa-badge">WhatsApp: +${waMatch[1]}</div>`; }
      }
      let socialsFormatted = "";
      if (socialStr) { socialsFormatted = socialStr.split(",").map((s) => s.trim()).filter(Boolean).join(" • "); }
      html += `
                    <tr>
                        <td style="text-align: center; font-weight: 800; color: #94a3b8;">${index + 1}</td>
                        <td>
                            <div class="bold">${lead.name}</div>
                            <div style="margin-top: 4px; color: #475569; font-size: 9px;"><span style="color: #94a3b8; font-weight: 700;">EXEC:</span> ${execStr}</div>
                            <div style="margin-top: 3px;"><span class="badge">${sourceStr}</span></div>
                        </td>
                        <td>
                            <div class="phone">${phoneStr}</div>
                            ${waBadge}
                            <div style="margin-top: 3px;" class="${emailStr !== "No Email" ? "email" : ""}">${emailStr}</div>
                            ${websiteStr ? `<div style="margin-top: 3px; font-size: 8px; color: #64748b; word-break: break-all;">Web: ${websiteStr}</div>` : ""}
                            ${socialsFormatted ? `<div class="social-list">Socials: ${socialsFormatted}</div>` : ""}
                        </td>
                        <td><div style="color: #334155; font-weight: 500;">${addressStr}</div></td>
                        <td>
                            <div class="badge" style="background: #f1f5f9; color: #0f172a; border-color: #cbd5e1;">${industryStr}</div>
                            <div style="color: #334155; font-weight: 700; margin-top: 3px; font-size: 9px;">${professionStr}</div>
                        </td>
                    </tr>
            `;
    });
    html += `
                </tbody>
            </table>
            <div class="footer">Report securely generated by ScrapeForge Autonomous Engine • ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
        </body>
        </html>
        `;
    const browserContext = await getCleanContext(true);
    context = browserContext.context;
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "25px", bottom: "25px", left: "20px", right: "20px" } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ScrapeForge_Report_${Date.now()}.pdf"`);
    res.status(200).send(pdfBuffer);
  } catch (error: any) { res.status(500).json({ error: error.message }); } finally { if (context) await context.close().catch(() => {}); }
});

// 🚀 RESERVOIR PDF EXPORT ENDPOINT
app.post("/api/scrape/export/reservoir/pdf", async (req, res) => {
  const { campaign } = req.body;
  let context: BrowserContext | null = null;
  try {
    const campFilter = campaign && campaign !== "all" ? campaign : "%";
    const rawReservoirLeads = db.prepare(`SELECT name, phone, email, address, city, state, country, executive_names, industry, profession, website, source, social_links, status, created_at FROM businesses WHERE campaign_name LIKE ? AND status = 'contact_dry' ORDER BY name ASC`).all(campFilter) as any[];
    const cleanVal = (val: any, fallback: string = "") => {
      if (!val) return fallback;
      const str = String(val).trim();
      if (str.toLowerCase() === "not found" || str.toLowerCase() === "null" || str.toLowerCase() === "undefined" || str === "") { return fallback; }
      return str;
    };
    if (rawReservoirLeads.length === 0) return res.status(404).json({ error: "No data found in the reservoir for this selection." });
    
    const totalReservoir = rawReservoirLeads.length;
    const withWebsite = rawReservoirLeads.filter((l) => cleanVal(l.website) !== "").length;
    const sourceCounts = rawReservoirLeads.reduce((acc, lead) => {
        const s = cleanVal(lead.source, "Unknown Engine");
        s.split(",").forEach((part) => {
          const trimmed = part.trim();
          if (trimmed) acc[trimmed] = (acc[trimmed] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>
    );
    const sourcesHtml = Object.entries(sourceCounts).map(([src, count]) => `<span class="badge" style="background: #e2e8f0; color: #334155; margin-right: 4px; margin-bottom: 4px;">${src}: ${count}</span>`).join("");
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                :root { --accent: #f59e0b; --text-main: #1e293b; --text-muted: #64748b; --border: #cbd5e1; }
                body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: var(--text-main); margin: 0; padding: 30px; background: white; font-size: 10px; }
                .header { border-bottom: 3px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                .header h1 { margin: 0; font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #0f172a; }
                .header p { margin: 4px 0 0 0; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
                .summary-box { background: #f8fafc; border: 1px solid var(--border); border-radius: 6px; padding: 12px 15px; margin-bottom: 25px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
                .summary-item { display: flex; flex-direction: column; }
                .summary-label { font-size: 8px; text-transform: uppercase; color: var(--text-muted); font-weight: 800; letter-spacing: 0.5px; margin-bottom: 3px; }
                .summary-val { font-size: 18px; font-weight: 900; color: var(--accent); }
                table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                th { background-color: #f1f5f9; text-align: left; padding: 10px 8px; border-bottom: 2px solid #94a3b8; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
                td { padding: 12px 8px; border-bottom: 1px solid var(--border); vertical-align: top; line-height: 1.4; }
                .bold { font-weight: 700; color: #0f172a; font-size: 12px; }
                .badge { display: inline-block; padding: 2px 5px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; font-size: 8px; text-transform: uppercase; color: #475569; margin-bottom: 3px; font-weight: 600; }
                .website { color: #0284c7; text-decoration: none; font-weight: 600; word-break: break-all; }
                .footer { margin-top: 30px; text-align: center; font-size: 9px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>ScrapeForge Reservoir Dump Matrix</h1>
                    <p>Campaign Sector: <strong>${campaign && campaign !== "all" ? campaign : "Global Reservoir Buffer"}</strong></p>
                </div>
            </div>
            <div class="summary-box">
                <div class="summary-item"><span class="summary-label">Total Dry Entities</span><span class="summary-val">${totalReservoir}</span></div>
                <div class="summary-item"><span class="summary-label">Captured Websites</span><span class="summary-val">${withWebsite}</span></div>
                <div class="summary-item"><span class="summary-label">Network Origin</span><div style="margin-top: 4px; display: flex; flex-wrap: wrap;">${sourcesHtml}</div></div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 4%; text-align: center;">#</th>
                        <th style="width: 32%;">Target Entity & Source</th>
                        <th style="width: 32%;">Web Coordinates & Footprint</th>
                        <th style="width: 32%;">Geographic Location</th>
                    </tr>
                </thead>
                <tbody>
        `;
    rawReservoirLeads.forEach((lead, index) => {
      const nameStr = cleanVal(lead.name, "Unnamed Target");
      const webStr = cleanVal(lead.website, "No Website Logged");
      const addressStr = cleanVal(lead.address, cleanVal(lead.city, "Location Unlisted"));
      const sourceStr = cleanVal(lead.source, "Direct Capture");
      html += `
                    <tr>
                        <td style="text-align: center; font-weight: 800; color: #94a3b8;">${index + 1}</td>
                        <td>
                            <div class="bold">${nameStr}</div>
                            <div style="margin-top: 4px;"><span class="badge">${sourceStr}</span></div>
                        </td>
                        <td>
                            ${webStr !== "No Website Logged" ? `<div class="website"><a href="${webStr}" target="_blank" style="color: #0284c7; text-decoration: none;">${webStr}</a></div>` : `<div style="color: #94a3b8;">${webStr}</div>`}
                        </td>
                        <td><div style="color: #334155; font-weight: 500;">${addressStr}</div></td>
                    </tr>
            `;
    });
    html += `
                </tbody>
            </table>
            <div class="footer">Reservoir Dump securely generated by ScrapeForge Autonomous Engine • ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
        </body>
        </html>
        `;
    const browserContext = await getCleanContext(true);
    context = browserContext.context;
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true, margin: { top: "25px", bottom: "25px", left: "20px", right: "20px" } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ScrapeForge_Reservoir_Report_${Date.now()}.pdf"`);
    res.status(200).send(pdfBuffer);
  } catch (error: any) { res.status(500).json({ error: error.message }); } finally { if (context) await context.close().catch(() => {}); }
});

app.post("/api/control/reservoir/retry", (req, res) => {
  try {
    const { campaign } = req.body;
    const campFilter = campaign && campaign !== "all" ? campaign : "%";
    const result = db.prepare(`UPDATE businesses SET status = 'pending_verification', ai_summary = 'Reservoir Re-ignition Triggered' WHERE status = 'contact_dry' AND campaign_name LIKE ?`).run(campFilter);
    globalState.isEnrichmentPaused = false;
    broadcast("success", `Reservoir breached. Reset ${result.changes} dry targets back to active verification queue.`, "System");
    return res.json({ success: true, retried: result.changes });
  } catch (e: any) { return res.status(500).json({ error: e.message }); }
});

// 🚀 ACTIVE VECTOR & STATE STATUS ENDPOINT
app.get("/api/vector", (req, res) => {
  res.json({
    success: true,
    data: {
      profession: globalState.activeProfession || "STANDBY",
      location: globalState.activeLocation || "STANDBY",
      isDiscoveryPaused: globalState.isDiscoveryPaused,
      isEnrichmentPaused: globalState.isEnrichmentPaused
    }
  });
});

// ==========================================
// 🚀 SOCIAL ACCOUNT ROUTES
// ==========================================
app.get("/api/social/status", (_req, res) => {
  try {
    const statuses = getSocialAccountStatuses();
    res.json({ success: true, statuses });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/social/connect", async (req, res) => {
  const { engine } = req.body;
  try {
    const result = await connectSocialAccount(engine);
    res.json({ success: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/social/disconnect", (req, res) => {
  const { engine } = req.body;
  try {
    const result = disconnectSocialAccount(engine);
    res.json({ success: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🚀 ENGINE STATE & ON-DEMAND IGNITION ROUTE
// ==========================================
let isEngineBooted = false;
app.post("/api/system/boot", async (req, res) => {
  if (isEngineBooted) {
    return res.json({ success: true, message: "Engine already online." });
  }

  isEngineBooted = true;
  res.json({ success: true, message: "Ignition sequence started." });
  try {
    broadcast("info", "Initiating ScrapeForge Boot Sequence...", "System");
    startNetworkMonitor();
    startEnrichmentWorker();

    // 🚀 Restored Session Verification Hook
    await verifySocialSessions();

    broadcast("success", "ScrapeForge is fully operational and awaiting commands.", "System");
  } catch (error: any) {
    broadcast("error", `Engine Boot Failure: ${error.message}`, "System");
    isEngineBooted = false;
  }
});

// ==========================================
// 🚀 PAIRWISE PORT REGISTRATION ENDPOINT
// ==========================================
let activeServerPort = 4000;
export const getActiveServerPort = () => activeServerPort;
app.get("/api/system/port-info", (req, res) => {
  res.json({ success: true, port: activeServerPort });
});

// ==========================================
// 🚀 AUTO-ITERATING PORT STARTUP (UP TO PORT 4009)
// ==========================================
const DEFAULT_PORT = parseInt(process.env.PORT || "4000", 10);
const MAX_PORT_LIMIT = DEFAULT_PORT + 10;
const startServer = (port: number) => {
  if (port >= MAX_PORT_LIMIT) {
    console.error(`❌ All ports between ${DEFAULT_PORT} and ${MAX_PORT_LIMIT - 1} are currently in use!`);
    process.exit(1);
  }
  const server = app.listen(port, () => {
    activeServerPort = port;
    writeDebug(`✅ EXPRESS SERVER ONLINE ON PORT ${port}`);
    console.log(`✅ API Server Online on Port ${port}. Awaiting UI Ignition Command...`);
  });
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} is busy. Automatically shifting to port ${port + 1}...\n`);
      startServer(port + 1); 
    } else {
      console.error(`❌ Server error: ${err.message}`);
      process.exit(1);
    }
  });
};
startServer(DEFAULT_PORT);