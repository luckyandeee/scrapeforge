import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import { upsertAndMergeBusiness, db, queries } from "../db/sqlite"; 
import { broadcast } from "../utils/logger";
import { normalizeUrl } from "../utils/url";
import { getCleanContext } from "../utils/browser";
import { globalState, autoHaltEngine } from "../index";

chromium.use(stealthPlugin());

const socialEngines = [
  {
    name: "LinkedIn-Native",
    cookieFile: "linkedin-cookies.json",
    loginUrl: "https://www.linkedin.com/login",
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
    loginUrl: "https://www.facebook.com",
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

const getHighValueCount = (campaignName: string): number => {
  const req = globalState.contactRequirement;
  const hasPhone = `(phone IS NOT NULL AND TRIM(phone) != '' AND LOWER(TRIM(phone)) NOT IN ('not found', 'null', 'undefined'))`;
  const hasEmail = `(email IS NOT NULL AND TRIM(email) != '' AND LOWER(TRIM(email)) NOT IN ('not found', 'null', 'undefined'))`;

  let condition = `AND (${hasPhone} OR ${hasEmail})`; 
  if (req === "phone") condition = `AND ${hasPhone}`;
  if (req === "email") condition = `AND ${hasEmail}`;
  if (req === "both") condition = `AND ${hasPhone} AND ${hasEmail}`;

  return db.prepare(`SELECT COUNT(id) FROM businesses WHERE campaign_name = ? ${condition}`).pluck().get(campaignName) as number;
};

export const verifySocialSessions = async () => {
  broadcast("info", "Executing Pre-Flight Auth Check for Social Matrix...", "System");
  for (const engine of socialEngines) {
    const cookiePath = path.resolve(process.cwd(), engine.cookieFile);
    if (!fs.existsSync(cookiePath)) {
        broadcast("warning", `[${engine.name}] Missing tokens. Opening browser for login...`, "System");
        let context: BrowserContext | null = null;
        let page: Page | null = null;
        try {
            // 🚀 FIX: Pass true for isExport (allows CSS/Images) and false for isHeadless (shows window)
            context = await getCleanContext(true, false);
            page = await context.newPage();
            await page.goto(engine.loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForURL(url => {
                const href = url.href;
                if (engine.name === "LinkedIn-Native") return href.includes("/feed/") || href.includes("/dashboard/");
                if (engine.name === "FB-Native") return href.includes("/?sk=");
                if (engine.name === "Insta-Native") return href.includes("/direct/") || href.includes("instagram.com/");
                return false;
            }, { timeout: 300000 }); 
            const cookies = await context.cookies();
            fs.writeFileSync(cookiePath, JSON.stringify(cookies));
            broadcast("success", `[${engine.name}] Session Secured and Saved.`, "System");
        } catch (error) {
            broadcast("warning", `[${engine.name}] Login failed or cancelled.`, "System");
        } finally {
            if (page) { await page.close().catch(() => {}); page = null; }
            if (context) { await context.close().catch(() => {}); context = null; }
        }
    } else {
        broadcast("success", `[${engine.name}] Auth Tokens Verified.`, "System");
    }
  }
};

export const scrapeSocialMatrix = async (campaignName: string, profession: string, location: string) => {
  broadcast("info", `Engaging Authenticated Social Matrix...`, "Social");
  let totalAdded = 0;

  for (const engine of socialEngines) {
    const cookiePath = path.resolve(process.cwd(), engine.cookieFile);
    if (!fs.existsSync(cookiePath)) {
        broadcast("warning", `[${engine.name}] Auth disabled. Skipping platform.`, "Social");
        continue; 
    }

    // 🚀 SPIDER MEMORY: Retrieve saved iteration/page for this specific social network
    const stateKey = `${campaignName}_${engine.name}_${profession.replace(/\s+/g, "_")}_${location.replace(/\s+/g, "_")}`;
    const stateRecord = queries.getEngineState.get(stateKey) as { last_page: number } | undefined;
    let iterationIdx = stateRecord ? stateRecord.last_page : 0;

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    
    try {
      context = await getCleanContext(); 
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await context.addCookies(cookies);
      
      page = await context.newPage();
      let emptyStrikes = 0;
      const seenUrlsThisSession = new Set<string>();

      if (engine.name === "FB-Native" || engine.name === "Insta-Native") {
          await page.goto(engine.url(profession, location, 0), { waitUntil: "domcontentloaded", timeout: 90000 });
          
          // 🚀 RAPID CATCH-UP: Fast-forward scrolling for FB & Insta
          if (iterationIdx > 0) {
              broadcast("info", `[${engine.name}] Restoring memory. Fast-forwarding to scroll depth ${iterationIdx}...`, "Social");
              for (let i = 0; i < iterationIdx; i++) {
                  if (globalState.killSignal || globalState.isDiscoveryPaused) break;
                  await page.evaluate(() => window.scrollBy(0, 1000));
                  await page.waitForTimeout(500); 
              }
          }
      } else {
          // LinkedIn
          if (iterationIdx > 0) {
              broadcast("info", `[${engine.name}] Restoring memory. Resuming search at Page ${iterationIdx + 1}...`, "Social");
          }
      }

      while (true) {
        if (globalState.killSignal) break;
        
// 🚀 ABSOLUTE HARD CAP ENFORCER
            if (globalState.targetLeadCount > 0) {
                const currentCount = getHighValueCount(campaignName);
                if (currentCount >= globalState.targetLeadCount) {
                    broadcast("success", `🎯 Exact target limit of ${globalState.targetLeadCount} reached. Halting Social scraper instantly.`, "System");
                    autoHaltEngine();
                    return; // Kills the function instantly
                }
            }

        while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));

        if (engine.name === "LinkedIn-Native") {
            const targetUrl = engine.url(profession, location, iterationIdx);
            await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        }

        try {
            await page.waitForSelector(engine.selectors[0], { state: 'attached', timeout: 30000 });
        } catch {}

        await page.mouse.move(Math.random() * 500, Math.random() * 500);
        await page.waitForTimeout(1000 + Math.random() * 1000); 
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
            totalAdded++;
          } catch {} 
        }

        broadcast("success", `[${engine.name}] Depth ${iterationIdx + 1} secured ${newYieldThisScroll} NEW native profiles.`, "Social");
        
        // 🚀 WRITE SPIDER MEMORY
        iterationIdx++;
        queries.updateEngineState.run(stateKey, iterationIdx);

        if (newYieldThisScroll === 0) {
          emptyStrikes++;
          if (emptyStrikes >= 3) break; 
        } else {
          emptyStrikes = 0;
        }
      }
    } catch (error: any) {
      broadcast("error", `[${engine.name}] Matrix Armored: ${error.message}`, "Social");
    } finally {
      // 🚀 STRICT PAGE GARBAGE COLLECTION
      if (page) { await page.close().catch(() => {}); page = null; }
      if (context) { await context.close().catch(() => {}); context = null; }
    }
  }
};