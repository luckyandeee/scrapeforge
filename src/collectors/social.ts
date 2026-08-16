import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page, Browser } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { upsertAndMergeBusiness, db, queries, getAppDataDir, getHighValueCount } from "../db/sqlite"; // 🚀 IMPORTED UNIFIED COUNTER
import { broadcast } from "../utils/logger";
import { normalizeUrl } from "../utils/url";
import { getCleanContext } from "../utils/browser";
import { globalState, autoHaltEngine } from "../index";

chromium.use(stealthPlugin());

export const socialEngines = [
  {
    name: "LinkedIn-Native",
    cookieFile: "linkedin-cookies.json",
    loginUrl: "https://www.linkedin.com/login",
    requiredCookie: "li_at",
    url: (query: string, location: string, p: number) => `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(`${query} ${location}`)}&page=${p + 1}`,
    selectors: [
        ".reusable-search__result-container a[href*='/company/']", 
        "a.app-aware-link[href*='/company/']",
        "ul.reusable-search__entity-result-list a", 
        "span.entity-result__title-text a"
    ]
  },
  {
    name: "FB-Native",
    cookieFile: "fb-cookies.json",
    loginUrl: "https://www.facebook.com/login",
    requiredCookie: "c_user",
    url: (query: string, location: string, p: number) => `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${query} ${location}`)}`,
    selectors: [
        "a[role='presentation'][href*='facebook.com/']", 
        "a[href*='facebook.com/']",
        "div[role='article'] a"
    ]
  },
  {
    name: "Insta-Native",
    cookieFile: "insta-cookies.json",
    loginUrl: "https://www.instagram.com/accounts/login/",
    requiredCookie: "sessionid",
    url: (query: string, location: string, p: number) => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(`${query} ${location}`)}`,
    selectors: ["a[href^='/']"] 
  }
];

const SOCIAL_NOISE = [
    '/explore/', '/p/', '/reels/', '/tags/', '/legal/', '/about/', 
    '/directory/', '/web/', '/accounts/', 'privacy', 'terms', 'popular', 
    'share', 'help', 'login', 'signup', 'meta_verified', 'direct/inbox',
    'spotify', 'zomato', 'netflix', 'amazon', 'microsoft'
];

const getCookiePath = (filename: string): string => {
  const appDataPath = path.join(getAppDataDir(), filename);
  const localPath = path.resolve(process.cwd(), filename);
  if (fs.existsSync(localPath) && !fs.existsSync(appDataPath)) return localPath;
  return appDataPath;
};

const launchSystemBrowser = async (options: any): Promise<Browser> => {
  try { return await chromium.launch({ ...options, channel: 'chrome' }); } 
  catch {
    try { return await chromium.launch({ ...options, channel: 'msedge' }); } 
    catch { return await chromium.launch(options); }
  }
};

// 🚀 STRICT COOKIE VALIDATOR: Checks for platform-specific auth tokens
export const isCookieFileValid = (filename: string, requiredCookie: string): boolean => {
  const cookiePath = getCookiePath(filename);
  if (!fs.existsSync(cookiePath)) return false;

  try {
    const rawData = fs.readFileSync(cookiePath, "utf8");
    const cookies = JSON.parse(rawData);

    if (!Array.isArray(cookies) || cookies.length === 0) return false;

    // Must contain the actual session token
    const hasAuthToken = cookies.some((c: any) => c.name === requiredCookie || c.name.includes(requiredCookie));
    if (!hasAuthToken) return false;

    const nowInSeconds = Date.now() / 1000;
    const isExpired = cookies.some((c: any) => c.name === requiredCookie && c.expires && c.expires > 0 && c.expires < nowInSeconds);

    if (isExpired) {
      fs.unlinkSync(cookiePath);
      return false;
    }

    return true;
  } catch {
    if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    return false;
  }
};

// 🚀 EXPOSED API: Fetch live social connection status
export const getSocialAccountStatuses = () => {
  const status: Record<string, boolean> = {};
  for (const engine of socialEngines) {
    status[engine.name] = isCookieFileValid(engine.cookieFile, engine.requiredCookie);
  }
  return status;
};

// 🚀 EXPOSED API: Disconnect / Unlink specific platform
export const disconnectSocialAccount = (engineName: string) => {
  const engine = socialEngines.find(e => e.name === engineName);
  if (!engine) return false;
  const cookiePath = getCookiePath(engine.cookieFile);
  if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
  broadcast("info", `[${engineName}] Session tokens purged by user.`, "Social");
  return true;
};

export const connectSocialAccount = async (engineName: string) => {
  const engine = socialEngines.find(e => e.name === engineName);
  if (!engine) throw new Error(`Engine ${engineName} not recognized.`);

  const cookiePath = getCookiePath(engine.cookieFile);
  broadcast("warning", `[${engine.name}] Launching standalone visible browser window...`, "System");

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // 🚀 DIRECT CHROMIUM SPAWN: Guaranteed to open a visible, interactive window
    browser = await chromium.launch({ 
      headless: false,
      channel: 'chrome', // Falls back safely if chrome isn't default
      args: [
        '--start-maximized', 
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ] 
    }).catch(async () => {
      // Ultimate fallback to bundled chromium if system chrome fails
      return await chromium.launch({ 
        headless: false,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'] 
      });
    });

    context = await browser.newContext({ 
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    page = await context.newPage();

    // Bring window to front using a small script evaluation post-load
    await page.goto(engine.loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    broadcast("info", `👉 Please log into [${engine.name}] in the newly opened browser window.`, "System");

    await page.waitForURL(url => {
      const href = url.href;
      if (engine.name === "LinkedIn-Native") return href.includes("/feed/") || href.includes("/dashboard/");
      if (engine.name === "FB-Native") return href.includes("/?sk=") || (href.includes("facebook.com") && !href.includes("/login"));
      if (engine.name === "Insta-Native") return href.includes("/direct/") || (href.includes("instagram.com") && !href.includes("/login") && !href.includes("/accounts/login"));
      return false;
    }, { timeout: 300000 }); // 5 minutes for user to log in manually

    const cookies = await context.cookies();
    fs.writeFileSync(cookiePath, JSON.stringify(cookies));
    broadcast("success", `[${engine.name}] Account successfully linked and tokens secured!`, "System");
    return true;
  } catch (err: any) {
    broadcast("error", `[${engine.name}] Authentication cancelled or failed: ${err.message}`, "System");
    return false;
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
};

export const verifySocialSessions = async () => {
  broadcast("info", "Executing Pre-Flight Auth Check for Social Matrix...", "System");

  for (const engine of socialEngines) {
    const isLinked = isCookieFileValid(engine.cookieFile, engine.requiredCookie);
    if (isLinked) {
      broadcast("success", `[${engine.name}] Live Auth Confirmed.`, "System");
    } else {
      // Just log the status — do NOT force an automatic popup window at boot!
      broadcast("info", `[${engine.name}] Unlinked / No active session stored.`, "System");
    }
  }
};

export const scrapeSocialMatrix = async (
  campaignName: string, 
  profession: string, 
  location: string, 
  lowPowerMode: boolean = false
) => {
  broadcast("info", `Engaging Authenticated Social Matrix (${lowPowerMode ? 'Eco Mode' : 'Normal Mode'})...`, "Social");
  let totalAdded = 0;

  const enginesToRun = lowPowerMode ? socialEngines.slice(0, 1) : socialEngines;

  for (const engine of enginesToRun) {
    const cookiePath = getCookiePath(engine.cookieFile);
    if (!isCookieFileValid(engine.cookieFile, engine.requiredCookie)) {
        broadcast("warning", `[${engine.name}] Unlinked or expired. Skipping platform.`, "Social");
        continue; 
    }

    const stateKey = `${campaignName}_${engine.name}_${profession.replace(/\s+/g, "_")}_${location.replace(/\s+/g, "_")}`;
    const stateRecord = queries.getEngineState.get(stateKey) as { last_page: number } | undefined;
    let iterationIdx = stateRecord ? stateRecord.last_page : 0;

    const MAX_SOCIAL_YIELD = lowPowerMode ? 10 : 40;

    let engineBrowser: Browser | null = null;
    let engineContext: BrowserContext | null = null;
    let page: Page | null = null;
    
    try {
      const cleanSession = await getCleanContext(); 
      engineBrowser = cleanSession.browser;
      engineContext = cleanSession.context;
      if (!engineContext) throw new Error("Failed to create clean browser context.");

      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await engineContext.addCookies(cookies);
      
      page = await engineContext.newPage();
      let emptyStrikes = 0;
      let sessionYield = 0;
      const seenUrlsThisSession = new Set<string>();

      if (engine.name === "FB-Native" || engine.name === "Insta-Native") {
          await page.goto(engine.url(profession, location, 0), { waitUntil: "domcontentloaded", timeout: 90000 });
          
          const currentUrl = page.url();
          if (currentUrl.includes("/login") || currentUrl.includes("/accounts/login") || currentUrl.includes("/authwall")) {
             broadcast("error", `[${engine.name}] Session revoked by platform. Invalidating cookies.`, "Social");
             if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
             continue;
          }

          if (iterationIdx > 0) {
              for (let i = 0; i < iterationIdx; i++) {
                  if (globalState.killSignal || globalState.isDiscoveryPaused) break;
                  await page.evaluate(() => window.scrollBy(0, 1000));
                  await page.waitForTimeout(lowPowerMode ? 1000 : 500); 
              }
          }
      }

      while (true) {
        if (globalState.killSignal || sessionYield >= MAX_SOCIAL_YIELD) break;

        // 🚀 UNIFIED LIMIT ENFORCER: Accurate limits respected mid-scroll
        if (globalState.targetLeadCount > 0) {
            if (getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
                 broadcast("success", `🎯 Target limit reached. Halting Social Matrix.`, "Social");
                 autoHaltEngine();
                 break;
            }
        }

        while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));

        if (engine.name === "LinkedIn-Native") {
            const targetUrl = engine.url(profession, location, iterationIdx);
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

            const currentUrl = page.url();
            if (currentUrl.includes("/login") || currentUrl.includes("/authwall")) {
               broadcast("error", `[${engine.name}] Session revoked by platform. Invalidating cookies.`, "Social");
               if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
               break;
            }
        }

        try {
            await page.waitForSelector(engine.selectors[0], { state: 'attached', timeout: 30000 });
        } catch {}

        await page.mouse.move(Math.random() * 500, Math.random() * 500);
        await page.waitForTimeout((lowPowerMode ? 3000 : 1000) + Math.random() * 1000); 
        await page.evaluate(() => window.scrollBy(0, 1000));

        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

        const links = await page.evaluate((selectors) => {
          let foundElements: HTMLAnchorElement[] = [];
          for (const sel of selectors) {
            const els = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[];
            if (els.length > 0) foundElements = [...foundElements, ...els];
          }
          return foundElements.map((a) => {
            let url = a.href.split('?')[0]; 
            return { title: a.innerText.trim() || "Social Profile", url };
          });
        }, engine.selectors);

        const cleanLinks = links.filter(item => {
            if (!item.url) return false;
            const lowerUrl = item.url.toLowerCase();
            if (SOCIAL_NOISE.some(noise => lowerUrl.includes(noise))) return false;
            if (lowerUrl.includes("/jobs") || lowerUrl.includes("/posts")) return false;
            return true;
        });

        const uniqueLinks = Array.from(new Map(cleanLinks.map(item => [item.url, item])).values());
        let newYieldThisScroll = 0;

        for (const link of uniqueLinks) {
          const cleanUrl = normalizeUrl(link.url);
          if (!cleanUrl) continue;
          
          if (seenUrlsThisSession.has(cleanUrl)) continue;
          seenUrlsThisSession.add(cleanUrl);

          try {
            upsertAndMergeBusiness({
                campaignName,
                name: link.title.substring(0, 60),
                website: cleanUrl,
                normalizedUrl: cleanUrl,
                source: engine.name,
                location
            });
            newYieldThisScroll++;
            sessionYield++;
            totalAdded++;
          } catch {} 
        }

        broadcast("success", `[${engine.name}] Depth ${iterationIdx + 1} secured ${newYieldThisScroll} NEW native profiles.`, "Social");
        
        iterationIdx++;
        queries.updateEngineState.run(stateKey, iterationIdx);

        if (newYieldThisScroll === 0) {
          emptyStrikes++;
          if (emptyStrikes >= (lowPowerMode ? 2 : 3)) break; 
        } else {
          emptyStrikes = 0;
        }
      }
    } catch (error: any) {
      broadcast("error", `[${engine.name}] Matrix Armored: ${error.message}`, "Social");
    } finally {
      if (page) { await page.close().catch(() => {}); page = null; }
      if (engineContext) { await engineContext.close().catch(() => {}); engineContext = null; }
      if (engineBrowser) { await engineBrowser.close().catch(() => {}); engineBrowser = null; }
    }
  }
};