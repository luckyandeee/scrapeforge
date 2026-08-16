import { BrowserContext, Page } from "playwright";
import fs from "fs";
import path from "path";
import { upsertAndMergeBusiness, db, queries, getHighValueCount } from "../db/sqlite"; // 🚀 IMPORTED UNIFIED COUNTER
import { broadcast } from "../utils/logger";
import { normalizeUrl } from "../utils/url";
import { getCleanContext } from "../utils/browser";
import { globalState, autoHaltEngine } from "../index";

export const scrapeGoogleMaps = async (
  context: BrowserContext,
  campaignName: string,
  profession: string,
  location: string,
  lowPowerMode: boolean = false 
): Promise<number> => {
  // 🚀 CLEAN QUERY DEDUPLICATION: Ensures we never pass "barber in Hyderabad in Hyderabad"
  const cleanProfession = profession.toLowerCase().includes(location.toLowerCase()) 
    ? profession 
    : `${profession} in ${location}`;

  broadcast("info", `Engaging Deep-Matrix Google Maps Harvester for [${cleanProfession}] (${lowPowerMode ? 'Eco Mode' : 'Normal Mode'})...`, "G-Maps");

  let feedPage: Page | null = null;
  let detailPage: Page | null = null;
  let added = 0;

  const stateKey = `${campaignName}_GMaps_${profession.replace(/\s+/g, "_")}_${location.replace(/\s+/g, "_")}`;
  const stateRecord = queries.getEngineState.get(stateKey) as { last_page: number } | undefined;
  let totalScrolls = stateRecord ? stateRecord.last_page : 0;

  try {
    // ==========================================
    // PHASE 1: THE FEED SCROLLER (MEMORY HEAVY)
    // ==========================================
    feedPage = await context.newPage();

    await feedPage.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const searchQuery = encodeURIComponent(cleanProfession);
    const mapsUrl = `https://www.google.com/maps/search/${searchQuery}`;

    await feedPage.goto(mapsUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
    
    const feedSelector = '[role="feed"]';
    await feedPage.waitForSelector(feedSelector, { timeout: 15000 }).catch(() => {});

    if (totalScrolls > 0) {
      broadcast("info", `Maps Matrix restoring memory... Fast-forwarding feed to depth level ${totalScrolls}.`, "G-Maps");
      for (let i = 0; i < totalScrolls; i++) {
        if (globalState.killSignal || globalState.isDiscoveryPaused) break;
        await feedPage.evaluate((sel) => {
          const feed = document.querySelector(sel);
          if (feed) feed.scrollTop = feed.scrollHeight;
        }, feedSelector);
        await feedPage.waitForTimeout(lowPowerMode ? 800 : 400); 
      }
    } else {
      broadcast("info", `Maps Matrix loaded. Initializing Endless Scroll Sequence...`, "G-Maps");
    }

    let lastCardCount = 0;
    let consecutiveStalls = 0;
    const MAX_STALLS = lowPowerMode ? 8 : 15;

    while (true) {
      if (globalState.killSignal) {
          broadcast("error", `Kill signal received. Terminating Maps Matrix.`, "G-Maps");
          break;
      }

      // 🚀 UNIFIED LIMIT ENFORCER
      if (globalState.targetLeadCount > 0) {
          if (getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
              broadcast("success", `Target high-value limit reached. Stopping Maps scroll.`, "G-Maps");
              break;
          }
      }

      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));

      await feedPage.evaluate((sel) => {
        const feed = document.querySelector(sel);
        if (feed) feed.scrollTop = feed.scrollHeight;
      }, feedSelector);

      await feedPage.waitForTimeout((lowPowerMode ? 4000 : 2000) + Math.random() * 1000);
      totalScrolls++;
      queries.updateEngineState.run(stateKey, totalScrolls); 

      const currentCardCount = await feedPage.$$eval(
        'a[href^="https://www.google.com/maps/place"]',
        (els) => els.length,
      );

      if (currentCardCount > lastCardCount) {
        broadcast("info", `Maps Stream expanding deeper: locked ${currentCardCount} targets so far...`, "G-Maps");
        lastCardCount = currentCardCount;
        consecutiveStalls = 0;
      } else {
        consecutiveStalls++;
        
        if (consecutiveStalls === 5 || consecutiveStalls === 10) {
          await feedPage.evaluate((sel) => {
            const feed = document.querySelector(sel);
            if (feed) feed.scrollBy(0, -800);
          }, feedSelector);
          await feedPage.waitForTimeout(2000);
        }

        if (consecutiveStalls >= MAX_STALLS) {
          broadcast("success", `Maps structural limit reached for sector [${location}]. Total cards accumulated: ${currentCardCount}`, "G-Maps");
          break;
        }
      }
    }

    const cardUrls = await feedPage.$$eval(
      'a[href^="https://www.google.com/maps/place"]',
      (els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).href))],
    );

    await feedPage.close().catch(() => {});
    feedPage = null;

    broadcast("info", `Endless feed compilation locked. Commencing deep profile parsing on ${cardUrls.length} targets...`, "G-Maps");


    // ==========================================
    // PHASE 2: DETAIL EXTRACTION (CLEAN MEMORY)
    // ==========================================
    detailPage = await context.newPage();
    
    await detailPage.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    for (const url of cardUrls) {
      if (globalState.killSignal) break;

      // 🚀 UNIFIED LIMIT ENFORCER
      if (globalState.targetLeadCount > 0) {
          if (getHighValueCount(campaignName, globalState.contactRequirement) >= globalState.targetLeadCount) {
              break;
          }
      }

      while (globalState.isDiscoveryPaused) await new Promise((r) => setTimeout(r, 3000));

      try {
        await detailPage.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await detailPage.waitForSelector("h1", { state: 'visible', timeout: 12000 });

        await Promise.all([
          detailPage.waitForSelector('button[data-item-id^="phone:"]', { state: 'attached', timeout: 3000 }).catch(() => {}),
          detailPage.waitForSelector('button[data-item-id="address"]', { state: 'attached', timeout: 3000 }).catch(() => {}),
          detailPage.waitForSelector('a[data-item-id="authority"]', { state: 'attached', timeout: 3000 }).catch(() => {})
        ]);

        const bizData = await detailPage.evaluate((fallbackProfession) => {
          const name = document.querySelector("h1")?.innerText?.trim() || "Local Business";

          const categoryEl = document.querySelector('button[jsaction="pane.rating.category"]') || document.querySelector('.fontBodyMedium button');
          let category = categoryEl ? (categoryEl as HTMLElement).innerText.trim() : "";
          if (!category || category.length <= 2 || category.toLowerCase() === "inti") {
            category = fallbackProfession;
          }

          const phoneEl = document.querySelector('button[data-item-id^="phone:"]') || document.querySelector('button[data-tooltip*="phone"]');
          const phone = phoneEl ? (phoneEl as HTMLElement).innerText.replace(/[^\x20-\x7E\d+]/g, "").trim() : "Not found";

          const addressEl = document.querySelector('button[data-item-id="address"]') || document.querySelector('button[data-tooltip*="address"]');
          const address = addressEl ? (addressEl as HTMLElement).innerText.replace(/[^\x20-\x7E\s,]/g, "").trim() : "Not found";

          const webEl = document.querySelector('a[data-item-id="authority"]') || document.querySelector('a[data-value="Website"]');
          const website = webEl ? (webEl as HTMLAnchorElement).href : null;
          
          const descriptionEl = document.querySelector('div[jsaction="pane.about.readmore"]');
          const description = descriptionEl ? (descriptionEl as HTMLElement).innerText : "";

          const ownerMatch = description.match(/(?:Founded by|Led by|Principal Architect|Owner:)\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i);
          const extractedOwner = ownerMatch ? ownerMatch[1] : "Not found";

          return { name, phone, address, website, socialLinks: "Not found", category, owner: extractedOwner };
        }, profession);

        let finalUrl = bizData.website
          ? normalizeUrl(bizData.website)
          : `gmaps://${encodeURIComponent(bizData.name.replace(/\s+/g, "-").toLowerCase())}`;

        if (finalUrl) {
          // 🚀 UNIFIED LIMIT ENFORCER
          if (globalState.targetLeadCount > 0) {
              const currentCount = getHighValueCount(campaignName, globalState.contactRequirement);
              if (currentCount >= globalState.targetLeadCount) {
                  broadcast("success", `🎯 Exact target limit of ${globalState.targetLeadCount} reached. Halting Google Maps scraper instantly.`, "System");
                  autoHaltEngine();
                  return added; 
              }
          }
          upsertAndMergeBusiness({
              campaignName,
              name: bizData.name,
              website: bizData.website || "No Website",
              normalizedUrl: finalUrl,
              source: "G-Maps",
              location,
              phone: bizData.phone,
              address: bizData.address
          });
          added++;

          const hasValidContact = (bizData.phone && bizData.phone !== "Not found") || (bizData.website && bizData.website !== "No Website");
          const targetStatus = hasValidContact ? "pending_verification" : "contact_dry";

          db.prepare(`
              UPDATE businesses 
              SET phone = CASE WHEN phone IS NULL OR phone = 'Not found' THEN ? ELSE phone END, 
                  address = CASE WHEN address IS NULL OR address = 'Not found' THEN ? ELSE address END, 
                  social_links = CASE WHEN social_links IS NULL OR social_links = 'Not found' THEN ? ELSE social_links END, 
                  industry = CASE WHEN industry IS NULL OR industry = 'Unknown' THEN ? ELSE industry END,
                  profession = CASE WHEN profession IS NULL OR profession = 'Unknown' THEN ? ELSE profession END,
                  executive_names = CASE WHEN executive_names IS NULL OR executive_names = 'Not found' THEN ? ELSE executive_names END,
                  status = CASE WHEN status = 'processed' THEN 'processed' ELSE ? END
              WHERE normalized_url = ?
          `).run(
            bizData.phone, bizData.address, bizData.socialLinks, bizData.category, bizData.category,
            bizData.owner, bizData.website ? targetStatus : "contact_dry", finalUrl
          );
        }

        if (lowPowerMode) {
          await new Promise((r) => setTimeout(r, 1500));
        }

      } catch (e: any) {
        continue;
      }
    }
    broadcast("success", `Deep Maps Extraction complete. Secured ${added} profiles.`, "G-Maps");
  } catch (error: any) {
    broadcast("error", `Maps Matrix Error: ${error.message}`, "G-Maps");
  } finally {
    if (feedPage) {
      await feedPage.close().catch(() => {});
      feedPage = null;
    }
    if (detailPage) {
      await detailPage.close().catch(() => {});
      detailPage = null;
    }
  }

  return added;
};