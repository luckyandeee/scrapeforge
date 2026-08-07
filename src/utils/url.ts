export const normalizeUrl = (rawUrl: string): string | null => {
    try {
        let url = rawUrl.trim();
        
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
        
        // STRICT HTTP/HTTPS VALIDATION
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;

        return `${parsed.protocol}//${parsed.hostname.replace(/^www\./, '')}${parsed.pathname}`.replace(/\/$/, '');
    } catch {
        return null;
    }
};