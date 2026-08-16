import { chromium } from "playwright-extra";
import type { Browser, BrowserContext } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

// @ts-ignore
chromium.use(stealthPlugin());

export const getCleanContext = async (isExport = false, isHeadless = true): Promise<{ browser: Browser, context: BrowserContext }> => {
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage', // CRITICAL: Forces Chromium to use disk instead of limited RAM
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--mute-audio',
    '--js-flags="--max-old-space-size=512"' // Hard cap JavaScript memory per tab to 512MB
  ];

  let browser: Browser;

  // 🚀 3-TIER BROWSER LAUNCHER: Guarantees browser execution across environments
  try {
    // Attempt 1: Native Google Chrome
    browser = await chromium.launch({
      headless: isHeadless,
      channel: 'chrome',
      args: launchArgs
    });
  } catch (err1) {
    try {
      // Attempt 2: Native Microsoft Edge (Guaranteed on Windows 10/11)
      browser = await chromium.launch({
        headless: isHeadless,
        channel: 'msedge',
        args: launchArgs
      });
    } catch (err2) {
      // Attempt 3: Bundled Playwright Fallback
      browser = await chromium.launch({
        headless: isHeadless,
        args: launchArgs
      });
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    bypassCSP: true // Prevents iframe/script loading bottlenecks
  });

  // 🚀 CRITICAL OPTIMIZATION: Block massive resources (Images, Fonts, Media) unless exporting PDF
  if (!isExport) {
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media", "font", "stylesheet"].includes(type)) {
        route.abort(); // Drops heavy files to keep RAM flat and speed up crawling
      } else {
        route.continue();
      }
    });
  }

  // 🚀 FATAL LEAK FIX: Return both the browser process and the context
  // This ensures the parent script can call await browser.close()
  return { browser, context };
};