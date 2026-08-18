import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from "playwright-extra";
import type { BrowserContext, Page, Browser } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { queries, upsertAndMergeBusiness, db, getHighValueCount } from "../db/sqlite"; 
import { normalizeUrl } from "../utils/url";
import { getCleanContext } from "../utils/browser";
import { broadcast } from "../utils/logger";
import { globalState, autoHaltEngine } from "../index";
import { validateIntentWithAI, expandGeoMatrix, generateAdvancedKeywordMatrix } from "../utils/ai";
import { scrapeGoogleMaps } from "./maps";
import { scrapeSocialMatrix } from "./social";

// @ts-ignore
chromium.use(stealthPlugin());

// 🚀 DUAL-THREAT REGEX: Extracts emails and phones instantly from search snippets
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g;

const getSanitizedQuery = (query: string, location: string) => {
    const locLower = location.toLowerCase();
    const queryLower = query.toLowerCase();
    return queryLower.includes(locLower) ? query : `${query} in ${location}`;
};

// 🚀 CRITICAL FIX: Added major OTAs and directories (Booking, Agoda, MakeMyTrip, etc.) 
// This stops the engine from scraping unbreakable giant corporate sites and forces it 
// to only capture the direct, easily-scrapable websites of local businesses.
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
  "zohodesk.com", "feedburner.com", "t.me", "spotify.com", "zomato.com", "apple.com",
  "booking.com", "agoda.com", "makemytrip.com", "goibibo.com", "cleartrip.com",
  "tripadvisor.com", "expedia.com", "hotels.com", "airbnb.com", "oyorooms.com",
  "trivago.com", "ixigo.com", "yatra.com", "easemytrip.com", "trip.com", "kayak.com",
  "luxuryhotelsguides.com", "boutiquehotelsguides.com"
]);

// 🚀 MEMORY FIX: Hoist array conversion out of the loop
const BLOCKLIST_ARR = Array.from(BLOCKLIST);

const isTargetNoisy = (url: string) => {
  try {
    if (/\.(jpg|jpeg|png|webp|gif|svg|bmp|mp4|pdf|zip)$/i.test(url)) return true;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("linkedin.com") || host.includes("facebook.com") || host.includes("instagram.com")) {
      return false; // Social media is required for XRay engines
    }
    return BLOCKLIST.has(host) || BLOCKLIST_ARR.some((blocked) => host.endsWith(`.${blocked}`));
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
      if (!cleanUrl || /\.(jpg|jpeg|png|webp|gif|svg|pdf|mp4|zip)(\?.*)?$/i.test(cleanUrl)) continue;
      if (cleanUrl.startsWith(baseUrl) || isTargetNoisy(cleanUrl)) continue;
      const titleToCheck = item.text.length > 3 ? item.text : new URL(cleanUrl).hostname;
      if (!(await validateIntentWithAI(profession, titleToCheck))) continue;
      if (globalState.targetLeadCount > 0 && getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
          broadcast("success", `🎯 Target limit reached. Halting Horizontal Spider.`, "System");
          autoHaltEngine();
          return extracted;
      }
      try {
        upsertAndMergeBusiness({
            campaignName,
            name: `AI-Spider: ${new URL(cleanUrl).hostname.replace(/^www\./, "")}`,
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
  urlBuilder: (q: string, p: number) => string, location: string, profession: string,
  lowPowerMode: boolean
): Promise<number> => {
  let page: Page | null = null;
  let uniqueAdded = 0;
  const MAX_YIELD_PER_ENGINE = lowPowerMode ? 5 : 15;
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
          broadcast("info", `Engine yield cap (${MAX_YIELD_PER_ENGINE}) reached. Yielding to other engines.`, engineName);
          break;
      }
      if (globalState.targetLeadCount > 0 && getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) break;
      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));
      const targetUrl = urlBuilder(queryStr, pageIdx);
      try {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout((lowPowerMode ? 5000 : 3000) + Math.random() * 3000);
        if (await handleBotWalls(page, engineName)) break;
        // 🚀 UPGRADED SMART-SNIPPET EXTRACTOR: Grabs link AND paragraph text securely
        const results = await page.evaluate(() => {
          const found: { title: string, url: string, snippet: string }[] = [];

          document.querySelectorAll('.result, .b_algo, .algo, .compTitle, h2, h3').forEach(container => {
              const a = container.querySelector('a') || (container.tagName.toLowerCase() === 'a' ? container : null);
              if (!a) return;

              const title = (a as HTMLElement).innerText.trim();
              if (!title || title.length < 3) return; // Drop blank / icon links
              let url = (a as HTMLAnchorElement).href;
              try {
                if (url.includes("uddg=")) url = decodeURIComponent(new URL(url).searchParams.get("uddg") || url);
                if (url.includes("RU=")) url = decodeURIComponent((url.split("RU=")[1] || "").split("/")[0]);
              } catch {}

              // Find the snippet block below the title
              const snipEl = container.querySelector('.result__snippet, .b_caption p, .fc-falcon, .VwiC3b, .compTitle + div');
              const snippet = snipEl ? (snipEl as HTMLElement).innerText : (container as HTMLElement).innerText;
              found.push({ title, url, snippet });
          });

          return found;
        });
        let pageYield = 0;

        if (results && results.length > 0) {
          for (const item of results) {
            const cleanUrl = normalizeUrl(item.url);
            if (!cleanUrl || isTargetNoisy(cleanUrl)) continue;
            const isXRay = engineName.includes('XRay');

            // If it's a generic web spider, ensure it mentions our location or profession to prevent junk
            if (!isXRay) {
                const contentText = (item.title + " " + item.snippet + " " + cleanUrl).toLowerCase();
                const baseLocToken = location.split(',')[0].split(' ')[0].toLowerCase();
                const profToken = profession.split(' ')[0].toLowerCase();
                if (!contentText.includes(baseLocToken) && !contentText.includes(profToken)) continue;
            }
            const isListicle = (!isXRay && /\b(top|best|list|\d+)\b/i.test(item.title));
            if (isListicle) {
              const spiderYield = await runHorizontalSpider(campaignName, cleanUrl, engineName, location, profession);
              if (spiderYield > 0) uniqueAdded += spiderYield;
              continue;
            }
            // 🚀 SMART TITLE CLEANER: Prevents "[Web Target]" logs
            let cleanName = item.title.split(" - ")[0].split(" | ")[0].split("…")[0].trim().substring(0, 60);
            if (!cleanName || cleanName === "") continue;
            if (globalState.targetLeadCount > 0 && getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
                broadcast("success", `🎯 Exact target limit reached. Halting Web scraper instantly.`, "System");
                autoHaltEngine();
                return uniqueAdded;
            }
            // 🚀 THE NATIVE SNIPER LOGIC: Extracts Phone & Email instantly from the search result text
            const emailsFound = item.snippet.match(EMAIL_REGEX);
            const phonesFound = item.snippet.match(PHONE_REGEX);

            let extractedEmail = emailsFound ? emailsFound.find((e: string) => !e.includes("example.com") && !e.includes("domain.com"))?.toLowerCase() || "Not found" : "Not found";
            let extractedPhone = phonesFound ? phonesFound[0].trim() : "Not found";
            try {
              upsertAndMergeBusiness({
                  campaignName,
                  name: cleanName,
                  website: cleanUrl,
                  normalizedUrl: cleanUrl,
                  source: engineName,
                  location
              });
              // 🚀 REQUIREMENT GUARD: Check if we actually found what the user asked for!
              const req = globalState.contactRequirement || "any";
              const gotPhone = extractedPhone !== "Not found";
              const gotEmail = extractedEmail !== "Not found";
              let isSatisfied = false;
              if (req === "any" && (gotPhone || gotEmail)) isSatisfied = true;
              if (req === "phone" && gotPhone) isSatisfied = true;
              if (req === "email" && gotEmail) isSatisfied = true;
              if (req === "both" && gotPhone && gotEmail) isSatisfied = true;
              if (isSatisfied) {
                 db.prepare(`
                    UPDATE businesses
                    SET email = CASE WHEN email IS NULL OR email = 'Not found' THEN ? ELSE email END,
                        phone = CASE WHEN phone IS NULL OR phone = 'Not found' THEN ? ELSE phone END,
                        status = 'processed',
                        ai_summary = 'Instant SERP Snippet Extraction'
                    WHERE normalized_url = ?
                 `).run(extractedEmail, extractedPhone, cleanUrl);
              }
              else if (isXRay || cleanUrl.includes("facebook.com") || cleanUrl.includes("instagram.com") || cleanUrl.includes("linkedin.com")) {
                 // 🚀 ANTI-JAM FIX: Mark social profiles dry if they don't meet requirements
                 db.prepare(`
                    UPDATE businesses
                    SET status = 'contact_dry',
                        ai_summary = 'Snippet empty or unmet filter. AI bypassed to prevent social login wall.'
                    WHERE normalized_url = ?
                 `).run(cleanUrl);
              }
              pageYield++;
              uniqueAdded++;
            } catch (err) {}
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
    if (page) await page.close().catch(() => {});
  }
  return uniqueAdded;
};

const querySearchCluster = async (campaignName: string, queryStr: string, specificLocation: string, lowPowerMode: boolean) => {
    if (globalState.killSignal) return;
    // 🚀 THESE ARE NOW ALL DUAL-THREAT SERP SNIPERS
    const searchEngines = [
      { name: "Web-Spider (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&s=${p * 30}` },
      { name: "Web-Spider (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&first=${p * 10 + 1}` },
      { name: "Web-Spider (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(q)}&b=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:linkedin.com/company OR site:linkedin.com/in ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&b=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:linkedin.com/company OR site:linkedin.com/in ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&first=${p * 10 + 1}` },
      { name: "LinkedIn-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com/company OR site:linkedin.com/in ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&s=${p * 30}` },
      { name: "FB-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&first=${p * 10 + 1}` },
      { name: "FB-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&b=${p * 10 + 1}` },
      { name: "FB-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:facebook.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&s=${p * 30}` },
      { name: "Insta-XRay (DuckDuckGo)", url: (q: string, p: number) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&s=${p * 30}` },
      { name: "Insta-XRay (Yahoo)", url: (q: string, p: number) => `https://search.yahoo.com/search?p=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&b=${p * 10 + 1}` },
      { name: "Insta-XRay (Bing)", url: (q: string, p: number) => `https://www.bing.com/search?q=${encodeURIComponent(`site:instagram.com ${q} ${specificLocation} "@gmail.com" OR "+91"`)}&first=${p * 10 + 1}` }
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
    const CONCURRENCY_LIMIT = lowPowerMode ? 1 : 2;
    for (let i = 0; i < shuffledEngines.length; i += CONCURRENCY_LIMIT) {
      if (globalState.killSignal) break;
      const chunk = shuffledEngines.slice(i, i + CONCURRENCY_LIMIT);
      if (lowPowerMode) {
        for (const engine of chunk) {
          if (globalState.killSignal) break;
          let engineBrowser: Browser | null = null;
          let engineContext: BrowserContext | null = null;
          try {
            const cleanSession = await getCleanContext();
            engineBrowser = cleanSession.browser;
            engineContext = cleanSession.context;
            await scrapeEngine(engineContext, engine.name, queryStr, campaignName, engine.url, specificLocation, queryStr, true);
          } catch (e) {
          } finally {
            if (engineContext) { await engineContext.close().catch(() => {}); engineContext = null; }
            if (engineBrowser) { await engineBrowser.close().catch(() => {}); engineBrowser = null; }
          }
        }
      } else {
        await Promise.allSettled(chunk.map(async (engine) => {
          let engineBrowser: Browser | null = null;
          let engineContext: BrowserContext | null = null;
          try {
            const cleanSession = await getCleanContext();
            engineBrowser = cleanSession.browser;
            engineContext = cleanSession.context;
            await scrapeEngine(engineContext, engine.name, queryStr, campaignName, engine.url, specificLocation, queryStr, false);
          } catch (e) {
          } finally {
            if (engineContext) { await engineContext.close().catch(() => {}); engineContext = null; }
            if (engineBrowser) { await engineBrowser.close().catch(() => {}); engineBrowser = null; }
          }
        }));
      }
      await new Promise((r) => setTimeout(r, lowPowerMode ? 4000 : 2000));
    }
};

// 🚀 UPDATED: Accepting engines object parameter
export const discoverBusinesses = async (
  campaignName: string,
  profession: string,
  baseLocation: string,
  limit: number = 0,
  lowPowerMode: boolean = false,
  engines: { maps: boolean, web: boolean, social: boolean } = { maps: true, web: true, social: true }
) => {
  broadcast("info", `🤖 AI Core analyzing target zone [${baseLocation}]...`, "System");
  let surroundingSectors = [baseLocation];

  try {
      surroundingSectors = await expandGeoMatrix(baseLocation, lowPowerMode);
      broadcast("success", `🗺️ AI mapped ${surroundingSectors.length} sector nodes: ${surroundingSectors.join(", ")}`, "System");
  } catch (e: any) {
      broadcast("warning", `AI Geo-expansion taking too long or failed. Falling back to base location.`, "System");
  }
  
  let iterationLoop = 0;
  
  while (true) {
    if (globalState.killSignal) break;
    if (globalState.targetLeadCount > 0 && getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
        broadcast("success", `🎯 Target limit of ${globalState.targetLeadCount} successfully achieved. Auto-halting all engines.`, "System");
        autoHaltEngine();
        return;
    }
    
    const currentSector = surroundingSectors[iterationLoop % surroundingSectors.length];
    broadcast("info", `🚀 Engaging Autonomous Matrix [Cycle ${iterationLoop + 1}] -> Scanning Sector: ${currentSector}`, "System");
    let rankingKeywords = [profession];

    try {
        rankingKeywords = await generateAdvancedKeywordMatrix(profession, currentSector, lowPowerMode);
    } catch (e: any) {
        broadcast("warning", `AI Keyword generation failed. Proceeding with raw base keywords.`, "System");
    }

    for (const queryVariant of rankingKeywords) {
      if (globalState.killSignal) break;
      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));
      const sanitizedVariant = getSanitizedQuery(queryVariant, currentSector);
      
      if (globalState.targetLeadCount > 0 && getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
         broadcast("success", `🎯 Target limit reached! Halting active spider threads.`, "System");
         autoHaltEngine();
         return;
      }

      const runMaps = async () => {
        let mapsBrowser: Browser | null = null;
        let ctx: BrowserContext | null = null;
        try {
          const cleanSession = await getCleanContext();
          mapsBrowser = cleanSession.browser;
          ctx = cleanSession.context;
          await scrapeGoogleMaps(ctx, campaignName, sanitizedVariant, currentSector, lowPowerMode);
        } catch (e: any) {
        } finally {
          if (ctx) { await ctx.close().catch(() => {}); ctx = null; }
          if (mapsBrowser) { await mapsBrowser.close().catch(() => {}); mapsBrowser = null; }
        }
      };
      
      const runSearch = async () => {
        await querySearchCluster(campaignName, sanitizedVariant, currentSector, lowPowerMode).catch(() => {});
      };
      
      const runSocial = async () => {
        await scrapeSocialMatrix(campaignName, profession, currentSector, lowPowerMode).catch(() => {});
      };

      // 🚀 TARGETED IGNITION (Respects the UI checkboxes!)
      if (lowPowerMode) {
        if (engines.maps) await runMaps();
        if (engines.web) await runSearch();
        if (engines.social) await runSocial();
      } else {
        const activeTasks = [];
        if (engines.maps) activeTasks.push(runMaps());
        if (engines.web) activeTasks.push(runSearch());
        if (engines.social) activeTasks.push(runSocial());
        
        await Promise.allSettled(activeTasks);
      }
    }
    
    iterationLoop++;
    await new Promise((r) => setTimeout(r, lowPowerMode ? 20000 : 10000));
  }
  
  broadcast("success", `Autonomous Campaign Pipeline Complete for [${baseLocation}].`, "System");
};