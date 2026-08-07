// ==========================================
// INPUT SANITIZATION
// ==========================================
export const sanitizeQuery = (input: string): string => {
    if (!input) return '';
    // Strip special characters, prevent query injection, enforce length limits
    return input
        .replace(/[^\w\s-]/g, '')
        .trim()
        .substring(0, 50); // Cap length to prevent buffer/timeout attacks
};

// ==========================================
// CANONICAL URL NORMALIZATION
// ==========================================
export const normalizeUrl = (rawUrl: string): string | null => {
    try {
        let url = rawUrl.trim();
        
        // Decrypt Search Engine tracking wrappers
        if (url.includes('google.com/url?q=')) {
            const match = url.match(/q=([^&]+)/);
            if (match) url = decodeURIComponent(match[1]);
        }
        if (url.includes('RU=')) {
            const match = url.match(/RU=([^/]+)/);
            if (match) url = decodeURIComponent(match[1]);
        }
        if (url.includes('uddg=')) {
            const match = url.match(/uddg=([^&]+)/);
            if (match) url = decodeURIComponent(match[1]);
        }

        const parsed = new URL(url);
        
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }

        // 1. Force HTTPS for canonical matching
        // 2. Strip 'www.' subdomains
        // 3. Remove all query parameters (?utm_source=...)
        // 4. Remove fragments (#section)
        // 5. Drop trailing slashes
        const host = parsed.hostname.replace(/^www\./, '');
        const pathname = parsed.pathname === '/' ? '' : parsed.pathname;
        
        return `https://${host}${pathname}`;
    } catch {
        return null;
    }
};

// ==========================================
// CONFIGURABLE NOISE FILTER
// ==========================================
// Moved to a configurable blocklist logic rather than hardcoded includes()
const BLOCKLIST = new Set([
    'yahoo.com', 'bing.com', 'ask.com', 'google.com', 'duckduckgo.com', 'openstreetmap.org',
    'facebook.com', 'instagram.com', 'twitter.com', 'pinterest.com', 'youtube.com', 'linkedin.com',
    'magicbricks.com', 'houzz.com', 'houzz.in', 'adx.io', 'thearchitectsdiary.com', 'datagemba.com',
    'justdial.com', 'indiamart.com', 'urbancompany.com', 'sulekha.com', '99acres.com', 'architecturaldigest.in'
]);

export const isTargetNoisy = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        
        // Check exact matches and subdomain variations
        for (const blockedDomain of BLOCKLIST) {
            if (host === blockedDomain || host.endsWith(`.${blockedDomain}`)) {
                return true;
            }
        }
        return false;
    } catch {
        return true; 
    }
};