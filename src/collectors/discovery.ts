import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { queries, upsertAndMergeBusiness, db } from "../db/sqlite";
import { normalizeUrl } from "../utils/url";
import { getCleanContext } from "../utils/browser";
import { broadcast } from "../utils/logger";
import { globalState, autoHaltEngine } from "../index"; 
import { generateQueryMatrix, validateIntentWithAI, expandGeoMatrix, generateAdvancedKeywordMatrix } from "../utils/ai";
import { scrapeGoogleMaps } from "./maps"; 
import { scrapeSocialMatrix } from "./social";

chromium.use(stealthPlugin());

// 🚀 QUALITY-BASED LIMIT ENFORCER: Counts ONLY valid leads matching contact rules
const getHighValueCount = (campaignName: string): number => {
  const req = globalState.contactRequirement;
  const hasPhone = `(phone IS NOT NULL AND TRIM(phone) != '' AND LOWER(TRIM(phone)) NOT IN ('not found', 'null', 'undefined'))`;
  const hasEmail = `(email IS NOT NULL AND TRIM(email) != '' AND LOWER(TRIM(email)) NOT IN ('not found', 'null', 'undefined'))`;

  let condition = `AND (${hasPhone} OR ${hasEmail})`; // default 'any'
  if (req === "phone") condition = `AND ${hasPhone}`;
  if (req === "email") condition = `AND ${hasEmail}`;
  if (req === "both") condition = `AND ${hasPhone} AND ${hasEmail}`;

  return db.prepare(`
    SELECT COUNT(id) FROM businesses 
    WHERE campaign_name = ? ${condition}
  `).pluck().get(campaignName) as number;
};

const BLOCKLIST = new Set([
  "yahoo.com", "bing.com", "google.com", "duckduckgo.com", "openstreetmap.org",
  "facebook.com", "instagram.com", "twitter.com", "pinterest.com", "youtube.com",
  "linkedin.com", "justdial.com", "indiamart.com", "urbancompany.com", "sulekha.com",
  "99acres.com", "yelp.com", "magicbricks.com", "houzz.com", "houzz.in",
  "adx.io", "datagemba.com", "jdmagicbox.com", "thearchitectsdiary.com",
  "architecturaldigest.in", "livspace.com", "designcafe.com", "homelane.com",
  "nobroker.in", "pepperfry.com", "woodenstreet.com", "goodhomes.co.in",
  "maps.app.goo.gl", "goo.gl", "reddit.com", "whatsapp.com", "api.whatsapp.com",
  "x.com", "microsoft.com", "privacy.microsoft.com", "zohodesk.in",
  "zohodesk.com", "feedburner.com", "t.me", "spotify.com", "zomato.com", "apple.com"
]);

const isTargetNoisy = (url: string) => {
  try {
    if (/\.(jpg|jpeg|png|webp|gif|svg|bmp|mp4|pdf|zip)$/i.test(url)) return true;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("linkedin.com") || host.includes("facebook.com") || host.includes("instagram.com")) {
      return false; 
    }
    return BLOCKLIST.has(host) || Array.from(BLOCKLIST).some((blocked) => host.endsWith(`.${blocked}`));
  } catch {
    return true;
  }
};

const handleBotWalls = async (page: Page, engineName: string) => {
  try {
    const consent = await page.$('button[name="agree"], button.b_btn, #bnp_btn_accept, #L2AGLb');
    if (consent) {
      await consent.click();
      await page.waitForTimeout(2000);
    }
    const isCaptcha = await page.evaluate(() => 
        document.body.innerHTML.includes("g-recaptcha") || document.body.innerHTML.includes("hcaptcha")
    );
    if (isCaptcha) {
      broadcast("warning", `⚠️ [${engineName}] Security Bot-Wall encountered. Retracting vector safely.`, engineName);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const runHorizontalSpider = async (campaignName: string, blogUrl: string, sourceName: string, location: string, profession: string): Promise<number> => {
  let extracted = 0;
  try {
    const { data } = await axios.get(blogUrl, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, timeout: 10000 });
    const $ = cheerio.load(data);
    $("header, footer, nav, aside, .sidebar, .menu").remove();

    const linkElements = $('a[href^="http"]').map((_, el) => ({
      href: $(el).attr("href"),
      text: $(el).text().trim() || $(el).attr("title") || ""
    })).get();

    const baseUrl = new URL(blogUrl).origin; 

    for (const item of linkElements) {
      if (!item.href) continue;
      const cleanUrl = normalizeUrl(item.href);
      if (!cleanUrl) continue;
      if (/\.(jpg|jpeg|png|webp|gif|svg|pdf|mp4|zip)(\?.*)?$/i.test(cleanUrl)) continue;
      if (cleanUrl.startsWith(baseUrl)) continue;
      if (isTargetNoisy(cleanUrl)) continue;

      const titleToCheck = item.text.length > 3 ? item.text : new URL(cleanUrl).hostname;
      const isRelevant = await validateIntentWithAI(profession, titleToCheck);

      if (!isRelevant) continue;

      // 🚀 HARD CAP ENFORCER 1
      if (globalState.targetLeadCount > 0) {
        if (getHighValueCount(campaignName) >= globalState.targetLeadCount) {
            broadcast("success", `🎯 Target limit of ${globalState.targetLeadCount} reached. Halting Horizontal Spider instantly.`, "System");
            autoHaltEngine();
            return extracted;
        }
      }

      const domainName = new URL(cleanUrl).hostname.replace(/^www\./, "");
      try {
        upsertAndMergeBusiness({
            campaignName,
            name: `AI-Spider: ${domainName}`,
            website: cleanUrl,
            normalizedUrl: cleanUrl,
            source: `Spider [${sourceName}]`,
            location
        });
        extracted++;
      } catch {}
    }
  } catch (e) {}
  return extracted;
};

const scrapeEngine = async (
  context: BrowserContext, engineName: string, queryStr: string, campaignName: string,
  urlBuilder: (q: string, p: number) => string, location: string, profession: string
): Promise<number> => {
  let page: Page | null = null;
  let uniqueAdded = 0;
  
  // 🚀 LOAD BALANCER: Cap each individual engine so it cannot hoard the global limit
  const MAX_YIELD_PER_ENGINE = 15; 

  try {
    page = await context.newPage();
    const stateKey = `${campaignName}_${engineName}_${queryStr.replace(/\s+/g, "_")}`;
    const stateRecord = queries.getEngineState.get(stateKey) as { last_page: number } | undefined;
    let pageIdx = stateRecord ? stateRecord.last_page : 0;
    let emptyStrikes = 0;

    broadcast("info", `Breaching Network for [${location}]... Resuming at Page ${pageIdx + 1}`, engineName);

    while (true) {
      if (globalState.killSignal) break;

      if (uniqueAdded >= MAX_YIELD_PER_ENGINE) {
          broadcast("info", `Engine yield cap (${MAX_YIELD_PER_ENGINE}) reached. Yielding to other engines for diversity.`, engineName);
          break;
      }

      if (globalState.targetLeadCount > 0) {
        if (getHighValueCount(campaignName) >= globalState.targetLeadCount) break;
      }

      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));
      const targetUrl = urlBuilder(queryStr, pageIdx);

      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(3000 + Math.random() * 3000);

        if (await handleBotWalls(page, engineName)) break;

        const links = await page.evaluate(() => {
          const resultSelectors = 'h2 a, h3 a, .result__a, .b_algo a, a[href^="http"]';
          const anchors = Array.from(document.querySelectorAll(resultSelectors)) as HTMLAnchorElement[];
          
          return anchors.map(a => {
              let url = a.href;
              try {
                if (url.includes("uddg=")) url = decodeURIComponent(new URL(url).searchParams.get("uddg") || url);
                if (url.includes("RU=")) url = decodeURIComponent((url.split("RU=")[1] || "").split("/")[0]);
                if (url.includes("r.search.yahoo.com")) {
                    const match = url.match(/RU=([^/]+)/);
                    if (match) url = decodeURIComponent(match[1]);
                }
              } catch {}
              return { title: a.innerText.trim() || "Web Target", url };
          }).filter(item => {
              if (!item.url || item.url.length < 10) return false;
              const lower = item.url.toLowerCase();
              if (lower.includes('google.com') || lower.includes('bing.com') || lower.includes('yahoo.com') || lower.includes('duckduckgo.com') || lower.includes('aol.com') || lower.includes('microsoft.com')) return false;
              return true;
          });
        });

        let pageYield = 0;
        if (links.length > 0) {
          for (const link of links) {
            const cleanUrl = normalizeUrl(link.url);
            if (!cleanUrl) continue;

            const urlLower = cleanUrl.toLowerCase();
            if (
              urlLower.includes("spotify.com") || 
              urlLower.includes("zomato.com") || 
              urlLower.includes("onlyfans.com") || 
              urlLower.includes("/jobs") || 
              urlLower.includes("support.") ||
              urlLower.includes("help.")
            ) continue;

            const titleAndUrl = (link.title + " " + cleanUrl).toLowerCase();
            const baseLocToken = location.split(',')[0].toLowerCase();
            const profToken = profession.split(' ')[0].toLowerCase();

            if (!titleAndUrl.includes(baseLocToken) && !titleAndUrl.includes(profToken)) continue;

            const isXRay = engineName.includes('XRay');
            const isListicle = (!isXRay && /\b(top|best|list|\d+)\b/i.test(link.title)) || (!isXRay && isTargetNoisy(cleanUrl));

            if (isListicle) {
              const spiderYield = await runHorizontalSpider(campaignName, cleanUrl, engineName, location, profession);
              if (spiderYield > 0) uniqueAdded += spiderYield;
              continue; 
            }

            // 🚀 HARD CAP ENFORCER 2
            if (globalState.targetLeadCount > 0) {
                if (getHighValueCount(campaignName) >= globalState.targetLeadCount) {
                    broadcast("success", `🎯 Exact target limit of ${globalState.targetLeadCount} reached. Halting Web scraper instantly.`, "System");
                    autoHaltEngine();
                    return uniqueAdded;
                }
            }

            try {
              upsertAndMergeBusiness({
                  campaignName,
                  name: link.title.substring(0, 60),
                  website: cleanUrl,
                  normalizedUrl: cleanUrl,
                  source: engineName,
                  location
              });
              pageYield++;
              uniqueAdded++;
            } catch {}
          }
        }

        pageIdx++;
        queries.updateEngineState.run(stateKey, pageIdx);

        if (pageYield === 0) {
          emptyStrikes++;
          if (emptyStrikes >= 3) break;
        } else {
          emptyStrikes = 0;
        }
      } catch (err: any) {
        break;
      }
    }
  } catch (e: any) {
  } finally {
    if (page) {
      await page.close().catch(() => {});
      page = null;
    }
  }

  return uniqueAdded;
};

const querySearchCluster = async (campaignName: string, profession: string, specificLocation: string) => {
  const queryVariations = await generateQueryMatrix(profession, specificLocation);

  for (const queryStr of queryVariations) {
    if (globalState.killSignal) break; 

    const searchEngines = [
      { name: "Web-Spider (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&s=${p * 30}` },
      { name: "Web-Spider (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${p * 10 + 1}` },
      { name: "Web-Spider (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}&b=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:linkedin.com/company ${q} ${specificLocation}`)}&b=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:linkedin.com/company ${q} ${specificLocation}`)}&first=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com/company ${q} ${specificLocation}`)}&s=${p * 30}` },
      { name: "FB-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation}`)}&first=${p * 10 + 1}` },
      { name: "FB-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation}`)}&b=${p * 10 + 1}` },
      { name: "FB-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation}`)}&s=${p * 30}` },
      { name: "Insta-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation}`)}&s=${p * 30}` },
      { name: "Insta-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation}`)}&b=${p * 10 + 1}` },
      { name: "Insta-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation}`)}&first=${p * 10 + 1}` },
      { name: "OpenData-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:openstreetmap.org OR site:data.gov.in ${q} ${specificLocation}`)}&b=${p * 10 + 1}` },
      { name: "OpenData-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:openstreetmap.org OR site:data.gov.in ${q} ${specificLocation}`)}&first=${p * 10 + 1}` }
    ];

    function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const shuffledEngines = shuffle(searchEngines);

    const CONCURRENCY_LIMIT = 2; // Prevents OOM Memory Crash

    for (let i = 0; i < shuffledEngines.length; i += CONCURRENCY_LIMIT) {
      if (globalState.killSignal) break;

      const chunk = shuffledEngines.slice(i, i + CONCURRENCY_LIMIT);

      await Promise.allSettled(chunk.map(async (engine) => {
        let engineContext: BrowserContext | null = null;
        try {
          engineContext = await getCleanContext();
          await scrapeEngine(engineContext, engine.name, queryStr, campaignName, engine.url, specificLocation, profession);
        } catch (e) {
        } finally {
          if (engineContext) {
            await engineContext.close().catch(() => {});
            engineContext = null; 
          }
        }
      }));

      await new Promise((r) => setTimeout(r, 2000));
    }
  }
};

export const discoverBusinesses = async (campaignName: string, profession: string, baseLocation: string, limit: number = 0) => {
  broadcast("info", `🤖 AI Core analyzing target zone [${baseLocation}] for macro/micro geo-expansion...`, "System");

  const surroundingSectors = await expandGeoMatrix(baseLocation);
  broadcast("success", `🗺️ AI mapped ${surroundingSectors.length} sector nodes for deep harvesting: ${surroundingSectors.join(", ")}`, "System");

  let iterationLoop = 0;

  while (true) {
    if (globalState.killSignal) break;

    // 🚀 HARD CAP ENFORCER 3
    if (globalState.targetLeadCount > 0) {
      if (getHighValueCount(campaignName) >= globalState.targetLeadCount) {
        broadcast("success", `🎯 Target limit of ${globalState.targetLeadCount} successfully achieved. Auto-halting all engines.`, "System");
        autoHaltEngine();
        return; 
      }
    }

    const currentSector = surroundingSectors[iterationLoop % surroundingSectors.length];
    broadcast("info", `🚀 Engaging Autonomous Matrix [Cycle ${iterationLoop + 1}] -> Scanning Sector: ${currentSector}`, "System");

    const rankingKeywords = await generateAdvancedKeywordMatrix(profession, currentSector);
    
    for (const queryVariant of rankingKeywords) {
      if (globalState.killSignal) break;
      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));

      // 🚀 HARD CAP ENFORCER 4
      if (globalState.targetLeadCount > 0) {
         if (getHighValueCount(campaignName) >= globalState.targetLeadCount) {
             broadcast("success", `🎯 Target limit of ${globalState.targetLeadCount} reached! Halting active spider threads.`, "System");
             autoHaltEngine(); 
             return;
         }
      }

      const runMaps = async () => {
        let ctx: BrowserContext | null = null;
        try { 
          ctx = await getCleanContext();
          await scrapeGoogleMaps(ctx, campaignName, queryVariant, currentSector); 
        } catch (e: any) {
        } finally { 
          if (ctx) { 
            await ctx.close().catch(() => {}); 
            ctx = null; 
          } 
        }
      };

      const runSearch = async () => {
        await querySearchCluster(campaignName, queryVariant, currentSector).catch(() => {});
      };

      const runSocial = async () => {
        await scrapeSocialMatrix(campaignName, profession, currentSector).catch(() => {});
      };

      await Promise.allSettled([runMaps(), runSearch(), runSocial()]);
    }

    iterationLoop++;
    await new Promise((r) => setTimeout(r, 10000));
  }

  broadcast("success", `Autonomous Campaign Pipeline Complete for [${baseLocation}].`, "System");
};