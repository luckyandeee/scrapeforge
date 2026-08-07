import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, BrowserContext } from 'playwright';

// Apply stealth modifications globally
chromium.use(stealthPlugin());

let browserInstance: Browser | null = null;

// 🚀 OPTIMIZATION 1: Centralized Singleton Browser with Strict Memory Caps
export const getBrowser = async (isHeadless: boolean = true): Promise<Browser> => {
    // FIX: If an existing browser was launched in headless mode, but a headed session 
    // is now requested (e.g. for login), close the old instance so a visible one can launch.
    if (browserInstance) {
        // If the current instance's headless state doesn't match what's requested, terminate it
        const currentHeadless = (browserInstance as any)._options?.headless;
        if (currentHeadless !== isHeadless) {
            console.log(`⚠️ Switching browser mode (Headless: ${currentHeadless} -> ${isHeadless}). Restarting pool...`);
            await browserInstance.close();
            browserInstance = null;
        }
    }

    if (!browserInstance) {
        console.log(`⚙️ Booting persistent ${isHeadless ? "headless" : "HEADED (Visible)"} Chromium pool...`);
        browserInstance = await chromium.launch({ 
            headless: isHeadless,
            args: [
                "--disable-dev-shm-usage", // CRITICAL: Forces Chromium to use disk instead of limited RAM
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-gpu",
                "--disable-accelerated-2d-canvas",
                "--disable-canvas-aa",
                "--disable-2d-canvas-clip-aa",
                "--disable-gl-drawing-for-tests",
                "--disable-extensions",
                "--mute-audio",
                "--disable-background-networking",
                "--disable-ipc-flooding-protection",
                '--js-flags="--max-old-space-size=512"', // Hard cap JavaScript memory per tab to 512MB
            ]
        });
    }
    return browserInstance;
};

// 🚀 OPTIMIZATION 2: Context Reuse & Resource Blocking
export const getCleanContext = async (isExport: boolean = false, isHeadless: boolean = true): Promise<BrowserContext> => {
    // Pass the dynamic isHeadless flag to ensure the browser matches the visibility requirement
    const browser = await getBrowser(isHeadless); 
    
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        bypassCSP: true, // Prevents iframe/script loading bottlenecks
    });

    // 🚀 OPTIMIZATION 3: Block massive resources (Images, Fonts, Media) unless exporting PDF
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

    return context;
};

// Allows graceful shutdown if the Node process is killed
export const closeBrowserPool = async () => {
    if (browserInstance) {
        console.log("🛑 Terminating Chromium pool...");
        await browserInstance.close();
        browserInstance = null;
    }
};

// 🚀 ZOMBIE KILLER: Ensure the browser dies immediately if the Node.js terminal is closed/killed
process.on("SIGINT", async () => {
    await closeBrowserPool();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await closeBrowserPool();
    process.exit(0);
});