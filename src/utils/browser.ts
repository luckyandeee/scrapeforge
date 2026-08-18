import { chromium } from "playwright-extra";
import type { Browser, BrowserContext } from "playwright";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

// @ts-ignore
chromium.use(stealthPlugin());

export const getCleanContext = async (isExport = false, isHeadless = true, proxyUrl?: string): Promise<{ browser: Browser, context: BrowserContext }> => {
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage', // CRITICAL: Forces Chromium to use disk instead of limited RAM
    '--disable-features=IsolateOrigins,site-per-process', // Helps bypass strict cross-origin bot checks
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--mute-audio',
    '--js-flags="--max-old-space-size=512"' // Hard cap JavaScript memory per tab to 512MB
  ];

  let browser: Browser;

  // 🚀 NETWORK ARMOR: Format the proxy object if a proxy string is provided
  const proxyConfig = proxyUrl ? { server: proxyUrl } : undefined;

  // 🚀 3-TIER BROWSER LAUNCHER: Guarantees browser execution across environments
  try {
    // Attempt 1: Native Google Chrome
    browser = await chromium.launch({
      headless: isHeadless,
      channel: 'chrome',
      args: launchArgs,
      proxy: proxyConfig
    });
  } catch (err1) {
    try {
      // Attempt 2: Native Microsoft Edge (Guaranteed on Windows 10/11)
      browser = await chromium.launch({
        headless: isHeadless,
        channel: 'msedge',
        args: launchArgs,
        proxy: proxyConfig
      });
    } catch (err2) {
      // Attempt 3: Bundled Playwright Fallback
      browser = await chromium.launch({
        headless: isHeadless,
        args: launchArgs,
        proxy: proxyConfig
      });
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }, // Modern desktop resolution 
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36", // Updated to a modern, non-flagged version
    locale: 'en-US',
    timezoneId: 'Asia/Kolkata', // Matches local routing to reduce geographical IP flagging
    colorScheme: 'dark', // Emulates a real OS user preference
    bypassCSP: true 
  });

  // 🚀 TIMEOUT FIX: Increase thresholds to prevent 25000ms crash drops on heavy sites
  context.setDefaultNavigationTimeout(60000);
  context.setDefaultTimeout(60000);

  // 🚀 ANTI-BOT FIX: Only block heavy media. We MUST allow fonts and stylesheets 
  // so the DOM renders correctly. If CSS is blocked, anti-bot scripts detect 0x0 element sizes.
  if (!isExport) {
    await context.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (["image", "media"].includes(type)) {
        route.abort(); // Drops heavy files to save RAM
      } else {
        route.continue(); // Allows HTML, JS, CSS, and Fonts
      }
    });
  }

  // 🚀 FATAL LEAK FIX: Return both the browser process and the context
  // This ensures the parent script can call await browser.close()
  return { browser, context };
};