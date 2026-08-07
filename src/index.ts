import express from "express";
import cors from "cors";
import { Parser } from "json2csv";
import { db, queries } from "./db/sqlite";
import { verifySocialSessions } from "./collectors/social";
import { startNetworkMonitor } from "./utils/network";
import { discoverBusinesses } from "./collectors/discovery";
import { startEnrichmentWorker } from "./workers/enrichment";
import { broadcast, systemEvents } from "./utils/logger";
import { getCleanContext } from "./utils/browser";
import type { BrowserContext } from "playwright";
import { startCloudSyncWorker } from "./workers/cloudSync";

import { MongoClient } from 'mongodb';





// 🚀 INSTANT FLUSH: Resets all stuck or crashed leads back to the correct active queue
db.prepare("UPDATE businesses SET status = 'pending_verification' WHERE status IN ('processing', 'pending')").run();

// 🛡️ THE GLOBAL ANTI-CRASH SHIELD
process.on("uncaughtException", (err) => {
  console.error(
    "\n🔥 CRITICAL: Uncaught Exception intercepted. Engine surviving.",
    err.message,
  );
});

process.on('unhandledRejection', (reason: any) => {
    if (reason && reason.message && reason.message.includes('Target page, context or browser has been closed')) {
        return; 
    }
    console.error('🔥 CRITICAL Unhandled Rejection:', reason);
});



// 🚀 ENHANCED GLOBAL STATE
export const globalState = {
  isDiscoveryPaused: true,
  isEnrichmentPaused: true,
  isDiscoveryActive: false, // 🚀 NEW: Tracks the physical spider process
  killSignal: false,
  targetLeadCount: 0, 
  activeCampaign: "STANDBY", // 🚀 NEW: Tracks active campaign name
  activeProfession: "STANDBY",
  activeLocation: "STANDBY",
  contactRequirement: "any",
};

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 🚀 CLOUD MASTER ARCHIVE ROUTES (ADMIN ONLY)
// ==========================================
const MONGO_URI = "mongodb+srv://adsbylocalsuperman_db_user:KvYMFhFCDKM3b7yU@scrapeforge.slabx8z.mongodb.net/?retryWrites=true&w=majority&appName=ScrapeForge&family=4";
const DB_NAME = "scrapeforge_master";
const COLLECTION_NAME = "global_entities";

// ==========================================
// 🚀 AUTO-HEALING CLOUD CONNECTION MANAGER
// ==========================================
// ==========================================
// 🚀 PURE CLOUD CONNECTION POOL
// ==========================================
let globalCloudClient: MongoClient | null = null;

const getCloudDb = async () => {
  if (!globalCloudClient) {
    globalCloudClient = new MongoClient(MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    
    await globalCloudClient.connect();
    broadcast("success", "🔗 Cloud Connection Pool established natively.", "System");
  }
  return globalCloudClient.db(DB_NAME);
};

      

// ==========================================
// 1. CLOUD ENTITIES ROUTE (With Local SQLite Fallback)
// ==========================================
// ==========================================
// 1. CLOUD ENTITIES ROUTE (With Contact Filter Support)
// ==========================================
app.get("/api/cloud/entities", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const campaign = req.query.campaign as string;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const contact = (req.query.contact as string) || "any";
    const offset = (page - 1) * limit;

    let queryStr = `SELECT * FROM businesses WHERE 1=1`;
    const params: any[] = [];

    if (campaign && campaign !== "all") {
      queryStr += ` AND campaign_name = ?`;
      params.push(campaign);
    }
    if (category && category !== "all") {
      queryStr += ` AND profession = ?`;
      params.push(category);
    }
    if (search) {
      queryStr += ` AND (name LIKE ? OR city LIKE ? OR phone LIKE ? OR email LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // 🚀 Added Admin Contact Filter Logic
    if (contact === "phone") {
      queryStr += ` AND phone IS NOT NULL AND phone NOT IN ('Not found', 'null', 'undefined', '')`;
    } else if (contact === "email") {
      queryStr += ` AND email IS NOT NULL AND email NOT IN ('Not found', 'null', 'undefined', '')`;
    } else if (contact === "both") {
      queryStr += ` AND phone IS NOT NULL AND phone NOT IN ('Not found', 'null', 'undefined', '') AND email IS NOT NULL AND email NOT IN ('Not found', 'null', 'undefined', '')`;
    }

    queryStr += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const data = db.prepare(queryStr).all(...params);
    
    // Count total records matching the same filter criteria for pagination
    let countQuery = `SELECT COUNT(*) as count FROM businesses WHERE 1=1`;
    const countParams: any[] = [];
    if (campaign && campaign !== "all") {
      countQuery += ` AND campaign_name = ?`;
      countParams.push(campaign);
    }
    if (category && category !== "all") {
      countQuery += ` AND profession = ?`;
      countParams.push(category);
    }
    if (search) {
      countQuery += ` AND (name LIKE ? OR city LIKE ? OR phone LIKE ? OR email LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (contact === "phone") {
      countQuery += ` AND phone IS NOT NULL AND phone NOT IN ('Not found', 'null', 'undefined', '')`;
    } else if (contact === "email") {
      countQuery += ` AND email IS NOT NULL AND email NOT IN ('Not found', 'null', 'undefined', '')`;
    } else if (contact === "both") {
      countQuery += ` AND phone IS NOT NULL AND phone NOT IN ('Not found', 'null', 'undefined', '') AND email IS NOT NULL AND email NOT IN ('Not found', 'null', 'undefined', '')`;
    }

    const totalResult = db.prepare(countQuery).get(...countParams) as any;

    res.json({ success: true, data, total: totalResult ? totalResult.count : 0 });
  } catch (error: any) {
    console.error("Local Fallback Entities Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. CLOUD METADATA ROUTE (With Local SQLite Fallback)
// ==========================================
app.get("/api/cloud/metadata", async (req, res) => {
  try {
    const campaigns = queries.getCampaigns.all().map((c: any) => c.campaign_name);
    const categoriesStmt = db.prepare(`SELECT DISTINCT profession FROM businesses WHERE profession IS NOT NULL`).all();
    const categories = categoriesStmt.map((c: any) => c.profession);

    res.json({ 
      success: true, 
      campaigns: campaigns.filter(Boolean), 
      categories: categories.filter(Boolean) 
    });
  } catch (error: any) {
    console.error("Local Fallback Metadata Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});
export const autoHaltEngine = () => {
    // Check the flat property instead of activeVector
    if (globalState.activeProfession === "STANDBY") return; // Already stopped
    
    // Reset all global states to put the UI back to sleep
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
    globalState.isDiscoveryPaused = false;
    globalState.isEnrichmentPaused = false;
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

    // 🚀 BUG FIX: Strictly count only actual active verification states as "Buffer"
    const baseStats = (db.prepare(`
      SELECT 
        COUNT(id) as total,
        SUM(CASE WHEN status IN ('pending_verification', 'processing') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed
      FROM businesses 
      WHERE campaign_name LIKE ?
    `).get(campFilter) as any) || { total: 0, pending: 0, processed: 0 };

    const allLeads = db.prepare(`
      SELECT phone, email, source 
      FROM businesses 
      WHERE campaign_name LIKE ? AND (status = 'processed' OR status = 'pending_verification')
    `).all(campFilter) as any[];

    let highValue = 0;
    let phones = 0;
    let emails = 0;
    const sources: Record<string, number> = {};

    allLeads.forEach((lead) => {
      const p = lead.phone ? String(lead.phone).trim().toLowerCase() : "";
      const e = lead.email ? String(lead.email).trim().toLowerCase() : "";
      const hasPhone = p !== "" && p !== "not found" && p !== "null" && p !== "undefined";
      const hasEmail = e !== "" && e !== "not found" && e !== "null" && e !== "undefined";

      if (hasPhone || hasEmail) {
        highValue++;
        if (hasPhone) phones++;
        if (hasEmail) emails++;

        const s = lead.source ? String(lead.source) : "Unknown";
        s.split(",").forEach((part) => {
          const trimmed = part.trim();
          if (trimmed) sources[trimmed] = (sources[trimmed] || 0) + 1;
        });
      }
    });

    res.json({
      success: true,
      data: {
        total: baseStats.total || 0,
        pending: baseStats.pending || 0,
        processed: baseStats.processed || 0,
        highValue, phones, emails, sources,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const sendEvent = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  systemEvents.on("stream", sendEvent);
  req.on("close", () => systemEvents.off("stream", sendEvent));
});

// --- ENGINE CONTROL PANEL ROUTES ---
app.post("/api/control/enrichment/resume", (req, res) => {
  globalState.isEnrichmentPaused = false;
  broadcast("success", "AI Enrichment Engine Online and draining buffer...", "System");
  res.json({ success: true, message: "AI Resumed" });
});

app.post("/api/control/enrichment/pause", (req, res) => {
  globalState.isEnrichmentPaused = true;
  broadcast("warning", "AI Enrichment Engine Paused.", "System");
  res.json({ success: true, message: "AI Paused" });
});

// 🚀 SMART SPIDER RESUME (Auto-Respawn Logic)
app.post("/api/control/discovery/resume", (req, res) => {
  globalState.isDiscoveryPaused = false;
  globalState.killSignal = false; // Revoke any lingering kills

  const { campaign_name, profession, location, limit } = req.body;

  // Sync Backend State with the UI State
  if (campaign_name && profession && location) {
    globalState.activeCampaign = campaign_name;
    globalState.activeProfession = profession;
    globalState.activeLocation = location;
    globalState.targetLeadCount = limit ? parseInt(String(limit), 10) : 0;
  }

  // 🚀 Auto-Spawn: If the user hit Resume but the spider process is dead, start a new one seamlessly
  if (!globalState.isDiscoveryActive && globalState.activeCampaign !== "STANDBY" && globalState.activeCampaign !== "") {
    globalState.isDiscoveryActive = true;
    discoverBusinesses(
      globalState.activeCampaign,
      globalState.activeProfession,
      globalState.activeLocation,
      globalState.targetLeadCount
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

    if (!globalState.isDiscoveryActive) {
      globalState.isDiscoveryActive = true;
      discoverBusinesses(
        globalState.activeCampaign, globalState.activeProfession, globalState.activeLocation, globalState.targetLeadCount
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

    context = await getCleanContext(true);
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
                            <div class="website"><a href="${webStr}" target="_blank" style="color: #0284c7; text-decoration: none;">${webStr}</a></div>
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

    context = await getCleanContext(true);
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

// --- SECURITY GATEWAY ROUTE ---
app.post("/api/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false });

    const user = queries.verifyUser.get(username, password);
    
    if (user) {
      broadcast("success", `System access granted to user: ${username}`, "Security");
      res.json({ success: true });
    } else {
      broadcast("warning", `Failed access attempt for user: ${username}`, "Security");
      res.status(401).json({ success: false, error: "INVALID CREDENTIALS" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🚀 MONGODB AUTO-INDEXER (Staggered & Backgrounded to prevent Atlas SSL drops)
const buildCloudIndexes = async () => {
  let client: MongoClient | null = null;
  try {
    // Wait 5 seconds to let the Cloud Sync Worker establish its connection first
    await new Promise(r => setTimeout(r, 5000));
    broadcast("info", "Optimizing Cloud Database Indexes in background...", "System");

    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000, // 🚀 Keeps the socket alive during heavy index builds
    });
    
    await client.connect();
    const col = client.db(DB_NAME).collection(COLLECTION_NAME);
    const indexOptions = { background: true };

    // 🚀 STAGGERED DEPLOYMENT: Prevents Free-Tier TLS Connection Drops
const indexQueue: any[] = [
      { key: { found_in_campaigns: 1 }, name: "idx_campaigns" },
      { key: { profession: 1 }, name: "idx_profession" },
      { key: { phone: 1 }, name: "idx_phone" },
      { key: { email: 1 }, name: "idx_email" },
      { key: { cloud_synced_at: -1 }, name: "idx_sync_date" },
      { key: { name: "text", city: "text" }, name: "idx_search_text" }
    ];

    for (const idx of indexQueue) {
      try {
        await col.createIndex(idx.key, { ...indexOptions, name: idx.name });
        await new Promise(r => setTimeout(r, 1000)); // 1-second cooldown between builds
      } catch (e: any) {
        // Silently ignore if index already exists or is actively building
      }
    }

    broadcast("success", "MongoDB Cloud Indexes successfully optimized.", "System");
  } catch (error: any) {
    console.error("Index build failed:", error.message);
  } finally {
    if (client) await client.close();
  }
};

const bootEngine = async () => {
  try {
    broadcast("info", "Initiating ScrapeForge Boot Sequence...", "System");
    await verifySocialSessions();
    startNetworkMonitor();
    startEnrichmentWorker();
    startCloudSyncWorker();
    
    // 🚀 TRIGGER INDEX BUILDER ON BOOT
    await buildCloudIndexes();

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      broadcast("success", `🚀 API Server Online on Port ${PORT}`, "System");
      broadcast("success", "ScrapeForge is fully operational and awaiting commands.", "System");
    });
  } catch (error) {
    console.error("Fatal Engine Boot Failure:", error);
    process.exit(1);
  }
};

bootEngine();