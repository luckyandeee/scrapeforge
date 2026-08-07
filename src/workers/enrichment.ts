import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import { queries, db } from "../db/sqlite";
import { getCleanContext } from "../utils/browser";
import { broadcast } from "../utils/logger";
import { globalState } from "../index";

let isEnrichmentRunning = false;

const sanitize = (val: any) => {
    if (!val) return "Not found";
    const str = String(val).trim();
    if (str.toLowerCase() === "not found" || str.toLowerCase() === "none" || str.toLowerCase() === "null" || str === "") {
        return "Not found";
    }
    return str;
};

// 🚀 SMART SOCIAL ENTITY NAME REFINER
// 🚀 SMART SOCIAL ENTITY NAME REFINER (Upgraded to strip URL breadcrumbs and extract slugs)
const formatSocialEntityName = (rawName: string, url: string, pageTitle: string, ogSiteName?: string): string => {
    let name = rawName ? rawName.trim() : "";
    const lowerName = name.toLowerCase();

    // Detect if the scraper accidentally grabbed Google/Bing breadcrumb text or missing names
    const isNoisy = !name || name.length <= 3 || lowerName.includes('http') || lowerName.includes('›') || lowerName.includes('unk') || /^(?:t_s|st|bm|inti|web target)$/i.test(name);
    
    if (isNoisy) {
        try {
            const parsedUrl = new URL(url);
            
            // Extract clean slug directly from LinkedIn URLs
            if (parsedUrl.hostname.includes('linkedin.com') && parsedUrl.pathname.includes('/company/')) {
                const slug = parsedUrl.pathname.split('/company/')[1]?.split('/')[0];
                if (slug) return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            // Extract clean slug from Instagram URLs
            if (parsedUrl.hostname.includes('instagram.com')) {
                const slug = parsedUrl.pathname.split('/').filter(Boolean)[0];
                if (slug && !['p', 'reels', 'explore'].includes(slug)) return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            // Extract clean slug from Facebook URLs
            if (parsedUrl.hostname.includes('facebook.com')) {
                const slug = parsedUrl.pathname.split('/').filter(Boolean)[0];
                if (slug && !['groups', 'pages', 'watch', 'profile.php'].includes(slug)) return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            }
            
            if (ogSiteName && ogSiteName.length > 2 && !ogSiteName.toLowerCase().includes("instagram")) return ogSiteName;
            if (pageTitle && pageTitle.includes("•")) {
                const pt = pageTitle.split("•")[0].trim();
                if (pt && pt.length > 2 && !pt.toLowerCase().includes("instagram")) return pt;
            }
            
        } catch {}
        return "Social Entity Lead";
    }
    return name;
};

// 🚀 ADVANCED METADATA PARSER
const parseAdvancedMetadata = ($: cheerio.CheerioAPI, rawText: string, footerHtml: string) => {
    let address = "Not found";
    let city = "Not found";
    let state = "Not found";
    let country = "Not found";
    let phone = "Not found";
    let email = "Not found";
    let owner = "Not found";
    let founder = "Not found";
    let ceo = "Not found";
    let directors = "Not found";
    let whatsapp = "Not found";
    let businessHours = "Not found";
    let hasContactForm = false;

    if ($("input[type='email'], form[action*='contact'], textarea").length > 0) {
        hasContactForm = true;
    }

    $("a").each((_, el) => {
        const href = ($(el).attr("href") || "").toLowerCase();
        const match = href.match(/wa\.me\/(\d+)/i) || href.match(/[?&]phone=(\d+)/i) || href.match(/send\/?\?phone=(\d+)/i);
        if (match && match[1] && whatsapp === "Not found") whatsapp = match[1];
    });

    const ogSiteName = $('meta[property="og:site_name"]').attr("content") || "";
    const metaStreet = $('meta[property="business:contact_data:street_address"], meta[name="contact:street_address"]').attr("content");
    const metaCity = $('meta[property="business:contact_data:locality"], meta[name="contact:city"]').attr("content");
    const metaCountry = $('meta[property="business:contact_data:country_name"], meta[name="contact:country"]').attr("content");

    if (metaStreet && address === "Not found") address = metaStreet;
    if (metaCity && city === "Not found") city = metaCity;
    if (metaCountry && country === "Not found") country = metaCountry;

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const jsonText = $(el).html();
            if (!jsonText) return;
            const parsed = JSON.parse(jsonText);
            const items: any[] = [];

            const pushItems = (val: any) => {
                if (!val) return;
                if (Array.isArray(val)) {
                    val.forEach(v => pushItems(v));
                } else if (typeof val === "object") {
                    items.push(val);
                    if (val["@graph"] && Array.isArray(val["@graph"])) {
                        val["@graph"].forEach((g: any) => items.push(g));
                    }
                }
            };
            pushItems(parsed);

            for (const item of items) {
                const type = item["@type"];
                if (!type) continue;
                const typeStr = Array.isArray(type) ? type.join(" ") : String(type);

                if (/LocalBusiness|Organization|ProfessionalService|Store/i.test(typeStr)) {
                    if (item.telephone && phone === "Not found") phone = String(item.telephone);
                    if (item.email && email === "Not found") email = String(item.email);
                    if (item.openingHours && businessHours === "Not found") businessHours = Array.isArray(item.openingHours) ? item.openingHours.join(", ") : String(item.openingHours);

                    if (item.address) {
                        const addr = item.address;
                        if (addr.streetAddress && address === "Not found") address = String(addr.streetAddress);
                        if (addr.addressLocality && city === "Not found") city = String(addr.addressLocality);
                        if (addr.addressRegion && state === "Not found") state = String(addr.addressRegion);
                        if (addr.addressCountry) {
                            country = typeof addr.addressCountry === 'string' ? addr.addressCountry : (addr.addressCountry.name || country);
                        }
                    }

                    if (item.founder) {
                        const fNames = Array.isArray(item.founder) ? item.founder.map((f: any) => typeof f === 'string' ? f : f.name).filter(Boolean).join(", ") : (typeof item.founder === 'string' ? item.founder : item.founder?.name);
                        if (fNames) founder = fNames;
                    }
                }

                if (/Person/i.test(typeStr) && item.name) {
                    const jobTitle = (item.jobTitle || "").toLowerCase();
                    const personName = item.name;
                    if (jobTitle.includes("ceo") && ceo === "Not found") ceo = personName;
                    else if (jobTitle.includes("founder") && founder === "Not found") founder = personName;
                    else if (jobTitle.includes("owner") && owner === "Not found") owner = personName;
                    else if (jobTitle.includes("director") && directors === "Not found") directors = personName;
                }
            }
        } catch {}
    });

    if (footerHtml && (address === "Not found" || phone === "Not found" || email === "Not found")) {
        const $footer = cheerio.load(footerHtml);
        const footerText = $footer("footer").text();
        const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
        const phoneRegex = /(?:\+91|0)?[ -]*[6789]\d{9}/g;

        if (phone === "Not found") {
            const pFound = footerText.match(phoneRegex);
            if (pFound && pFound[0]) {
                const stripped = pFound[0].replace(/[^\d+]/g, '');
                if (stripped.length >= 10) phone = stripped;
            }
        }
        if (email === "Not found") {
            const eFound = footerText.match(emailRegex);
            if (eFound && eFound[0] && !eFound[0].includes('example.com')) {
                email = eFound[0].toLowerCase();
            }
        }
    }

    if (phone === "Not found") {
        $('a[href^="tel:"]').each((_, el) => {
            const href = $(el).attr("href");
            if (href) {
                const cleaned = href.replace("tel:", "").replace(/[^\d+]/g, "").trim();
                if (cleaned.length >= 10) phone = cleaned;
            }
        });
    }

    if (email === "Not found") {
        $('a[href^="mailto:"]').each((_, el) => {
            const href = $(el).attr("href");
            if (href) {
                const cleaned = href.replace("mailto:", "").split("?")[0].trim().toLowerCase();
                if (cleaned.includes("@")) email = cleaned;
            }
        });
    }

    if (phone === "Not found") {
        const phonesFound = rawText.match(/(?:\+91|0)?[ -]*[6789]\d{9}/g);
        if (phonesFound) {
            const cleanPhone = phonesFound.find(p => !p.includes('123456') && !p.includes('987654'));
            if (cleanPhone) {
                let stripped = cleanPhone.replace(/[^\d+]/g, '');
                if (stripped.length >= 10 && stripped.length <= 13) phone = stripped;
            }
        }
    }

    if (email === "Not found") {
        const emailsFound = rawText.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g);
        if (emailsFound) {
            const cleanEmail = emailsFound.find(e => !e.includes('example.com') && !e.includes('yourdomain'));
            if (cleanEmail) email = cleanEmail.trim().toLowerCase();
        }
    }

    return { address, city, state, country, phone, email, owner, founder, ceo, directors, whatsapp, businessHours, hasContactForm, ogSiteName };
};

// 🚀 CLEAN DOM SOCIAL EXTRACTOR
const extractSocialLinks = ($: cheerio.CheerioAPI): string => {
    const socials = new Set<string>();
    $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && typeof href === "string") {
            const lowerHref = href.toLowerCase();
            if (
                lowerHref.includes("facebook.com") || 
                lowerHref.includes("instagram.com") || 
                lowerHref.includes("linkedin.com") || 
                lowerHref.includes("twitter.com") || 
                lowerHref.includes("x.com")
            ) {
                if (!lowerHref.includes("/share") && !lowerHref.includes("/login") && !lowerHref.includes("/posts")) {
                    const cleanBase = href.split('?')[0].replace(/\/$/, "");
                    socials.add(cleanBase); 
                }
            }
        }
    });
    
    const uniqueMap = new Map<string, string>();
    Array.from(socials).forEach(link => {
        if (link.includes("facebook.com")) uniqueMap.set("facebook", link);
        else if (link.includes("instagram.com")) uniqueMap.set("instagram", link);
        else if (link.includes("linkedin.com")) uniqueMap.set("linkedin", link);
        else if (link.includes("twitter.com") || link.includes("x.com")) uniqueMap.set("twitter", link);
        else uniqueMap.set(link, link);
    });

    return Array.from(uniqueMap.values()).join(", ") || "Not found";
};

// 🚀 EXPANDED SUB-PAGE SNIPER SPIDER WITH PRIORITY KEYWORDS
const extractPageText = async (targetUrl: string): Promise<{ text: string, html: string, footerHtml: string }> => {
  const browserHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  };

  const isSocial = targetUrl.includes('linkedin.com') || targetUrl.includes('instagram.com') || targetUrl.includes('facebook.com');

  if (!isSocial) {
      try {
        const response = await axios.get(targetUrl, { headers: browserHeaders, timeout: 8000 });
        if (response.data.length > 500 && response.data.includes('@')) {
            const $ = cheerio.load(response.data);
            return { text: $("body").text(), html: response.data, footerHtml: $("footer").html() || "" }; 
        }
      } catch {}
  }

  const context = await getCleanContext();
  let page: Page | null = null;

  try {
    if (targetUrl.includes('linkedin.com')) {
        const cookiePath = path.resolve(process.cwd(), 'linkedin-cookies.json');
        if (fs.existsSync(cookiePath)) await context.addCookies(JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
    } else if (targetUrl.includes('instagram.com')) {
        const cookiePath = path.resolve(process.cwd(), 'insta-cookies.json');
        if (fs.existsSync(cookiePath)) await context.addCookies(JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
    } else if (targetUrl.includes('facebook.com')) {
        const cookiePath = path.resolve(process.cwd(), 'fb-cookies.json');
        if (fs.existsSync(cookiePath)) await context.addCookies(JSON.parse(fs.readFileSync(cookiePath, 'utf8')));
    }

    page = await context.newPage();
    
    await page.addInitScript(() => {
        setInterval(() => {
            document.querySelectorAll('[role="dialog"], .cookie-banner, #cookie-notice, .overlay, .modal').forEach(el => el.remove());
            document.body.style.overflow = 'auto'; 
        }, 1000);
    });

    if (isSocial) await page.waitForTimeout(2000 + Math.random() * 3000); 

    broadcast("info", `Breaching Target Domain: ${targetUrl}`, "Enrichment");
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    } catch (navErr: any) {
      throw new Error(`Navigation failed: ${navErr.message}`);
    }

    try { await page.waitForLoadState("networkidle", { timeout: 10000 }); } catch {}

    let rawHtml = await page.content();
    let pageText = rawHtml;
    let $initial = cheerio.load(rawHtml);
    let footerHtml = $initial("footer").html() || "";

    if (!isSocial) {
        const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(pageText);
        const hasPhone = /(?:\+91|0)?[ -]*[6789]\d{9}/.test(pageText);
        
        if (!hasEmail || !hasPhone) {
            const highYieldUrls = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const targets = new Set<string>();
                const keywords = ['contact', 'about', 'team', 'branch', 'location', 'leadership', 'management', 'our-story', 'company'];
                
                links.forEach(a => {
                    const txt = (a.innerText || '').toLowerCase();
                    const href = (a.href || '').toLowerCase();
                    if (keywords.some(kw => txt.includes(kw) || href.includes(kw))) {
                        if (a.href && !a.href.startsWith('mailto') && !a.href.startsWith('tel') && !a.href.includes('javascript')) {
                             targets.add(a.href);
                        }
                    }
                });
                return Array.from(targets).slice(0, 4);
            });

            if (highYieldUrls.length > 0) {
                broadcast("info", `Deploying Expanded Sniper Spider: Found ${highYieldUrls.length} high-value sub-pages.`, "Enrichment");
                for (const subUrl of highYieldUrls) {
                    if (subUrl === targetUrl) continue;
                    try {
                        await page.goto(subUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
                        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
                        const subText = await page.content();
                        pageText = pageText + "\n\n" + subText;
                        rawHtml = rawHtml + subText;
                    } catch (e) {}
                }
            }
        }
    }

    return { text: pageText, html: rawHtml, footerHtml };
  } catch (err: any) {
    throw new Error(`Extraction vector dropped: ${err.message}`);
  } finally {
    if (page) { await page.close().catch(() => {}); page = null; }
    await context.close().catch(() => {});
  }
};

export const startEnrichmentWorker = () => {
  broadcast("info", "AI Enrichment Core Initialized. Standing by...", "System");

  setInterval(async () => {
    try {
      // 🚀 FIXED: Added absolute Kill Signal enforcement
      if (globalState.isEnrichmentPaused || isEnrichmentRunning || globalState.killSignal) return;
      isEnrichmentRunning = true;

      const pending = queries.getPendingBusinesses.all(3) as any[];

      if (pending.length === 0) {
        const stuck = db.prepare("UPDATE businesses SET status = 'pending_verification' WHERE status = 'processing'").run();
        if (stuck.changes > 0) {
            broadcast("warning", `Matrix Self-Heal: Re-queued ${stuck.changes} ghost processes.`, "System");
        }
        isEnrichmentRunning = false;
        return;
      }

      for (const b of pending) queries.markProcessing.run(b.id);

      await Promise.allSettled(
        pending.map(async (business) => {
          // 🚀 FIXED: Mid-flight Abort. If Stop is clicked while processing, drop the lead and return it to the queue safely.
          if (globalState.killSignal) {
              db.prepare("UPDATE businesses SET status = 'pending_verification' WHERE id = ?").run(business.id);
              return;
          }

          let activeUrl = business.normalized_url || business.website;

          if (!activeUrl || activeUrl.includes("No Website") || activeUrl === "Not found" || activeUrl === "null") {
              const expectedProfession = business.profession && business.profession !== "Unknown" ? business.profession : "Business";
              const hasValidPhone = business.phone && business.phone !== "Not found" && business.phone !== "null";
              const finalStatus = hasValidPhone ? "processed" : "contact_dry";
              
              queries.updateBusinessAI.run({
                  phone: sanitize(business.phone),
                  email: sanitize(business.email),
                  address: sanitize(business.address),
                  city: sanitize(business.city || "Hyderabad"),
                  state: sanitize(business.state),
                  country: sanitize(business.country || "India"),
                  executive_names: sanitize(business.executive_names),
                  industry: expectedProfession,
                  main_category: expectedProfession,
                  sub_category: expectedProfession,
                  profession: expectedProfession,
                  ai_summary: "Direct Vector (No Web URL Required)",
                  social_links: sanitize(business.social_links),
                  status: finalStatus,
                  id: business.id,
              });
              broadcast("success", `Entity Vector for [${business.name}] secured directly from local buffer.`, "Enrichment");
              return;
          }

          try {
            let extractionResult;
            try {
                extractionResult = await extractPageText(activeUrl);
            } catch (navError: any) {
                if (navError.message.includes("ERR_NAME_NOT_RESOLVED") && business.social_links && business.social_links !== "Not found") {
                    const fallbackSocial = business.social_links.split(",").map((s: string) => s.trim()).find((s: string) => s.includes("instagram.com") || s.includes("facebook.com") || s.includes("linkedin.com"));
                    if (fallbackSocial) {
                        broadcast("warning", `Domain resolution failed. Pivoting to fallback social vector: ${fallbackSocial}`, "Enrichment");
                        activeUrl = fallbackSocial;
                        extractionResult = await extractPageText(activeUrl);
                    } else { throw navError; }
                } else { throw navError; }
            }

            const { text, html, footerHtml } = extractionResult;
            const $ = cheerio.load(html);
            const pageTitle = $("title").text();
            const metadata = parseAdvancedMetadata($, html, footerHtml);
            const formattedName = formatSocialEntityName(business.name, activeUrl, pageTitle, metadata.ogSiteName);

            $("script, style, noscript, svg, img, nav, header, footer, aside, .hidden, [style*='display: none']").remove();
            
            const coreContent = $("main, [role='main'], article, #main-content, .main-content");
            let combinedText = coreContent.length > 0 ? coreContent.text() : $("body").text();
            combinedText = combinedText.replace(/\s+/g, " ").trim();

            if (combinedText.length < 20) throw new Error("DOM context dry.");

            const foundSocials = extractSocialLinks(cheerio.load(html)); 
            const expectedProfession = business.profession && business.profession !== "Unknown" ? business.profession : "Business";
            const targetCity = business.target_location !== 'Unknown' ? business.target_location : metadata.city;

            let finalStatus = "processed";
            const hasPhone = sanitize(metadata.phone) !== "Not found";
            const hasEmail = sanitize(metadata.email) !== "Not found";

            if (!hasPhone && !hasEmail) {
                finalStatus = "contact_dry"; 
                broadcast("warning", `[${formattedName}] Missing direct contact (No Tel/SMTP). Diverting to Reservoir.`, "Enrichment");
            }

            const execList = [metadata.ceo, metadata.founder, metadata.owner, metadata.directors].filter(x => x !== "Not found").join(", ");
            const finalExecNames = execList || "Not found";

            let summaryNotes = "Processed via Comprehensive Schema Matrix";
            if (metadata.whatsapp !== "Not found") summaryNotes += ` | WA: ${metadata.whatsapp}`;
            if (metadata.hasContactForm) summaryNotes += ` | Contact Form Available`;

            queries.updateBusinessAI.run({
                phone: sanitize(metadata.phone),
                email: sanitize(metadata.email),
                address: sanitize(metadata.address), 
                city: sanitize(targetCity), 
                state: sanitize(metadata.state), 
                country: sanitize(metadata.country), 
                executive_names: sanitize(finalExecNames), 
                industry: expectedProfession, 
                main_category: expectedProfession,
                sub_category: expectedProfession,
                profession: expectedProfession,
                ai_summary: summaryNotes,
                social_links: foundSocials,
                status: finalStatus, 
                id: business.id, 
            });

            if (formattedName !== business.name) {
                db.prepare(`UPDATE businesses SET name = ? WHERE id = ?`).run(formattedName, business.id);
            }

            broadcast("success", `Entity Vector for [${formattedName}] secured instantly.`, "Enrichment");
          } catch (error: any) {
            broadcast("error", `Worker skipped business ${business.id}: ${error.message}`, "Enrichment");
            queries.updateBusinessAI.run({
              phone: "Not found", email: "Not found", address: "Not found", city: "Not found",
              state: "Not found", country: "Not found", executive_names: "Not found",
              industry: "Unknown", main_category: "Unknown", sub_category: "Unknown",
              profession: "Unknown", ai_summary: `Skipped: ${error.message}`, social_links: "Not found",
              status: "contact_dry", id: business.id,
            });
          }
        })
      );
    } catch (criticalError: any) {
        broadcast("error", `Enrichment Loop Crash: ${criticalError.message}`, "Enrichment");
    } finally {
      isEnrichmentRunning = false;
    }
  }, 3000);
};

