import axios from "axios";
import { broadcast } from "./logger";

let freeProxyPool: string[] = [];

export const getFreeProxy = async (): Promise<string | undefined> => {
    // If the pool is empty, fetch a fresh list of free "Elite" HTTP proxies
    if (freeProxyPool.length === 0) {
        try {
            broadcast("info", "Fetching fresh IP pool from public proxy networks...", "System");
            
            // Fetches all anonymous, elite HTTP proxies that responded within 5 seconds
            const res = await axios.get("https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=elite");
            
            // Split the raw text response by newlines to create an array
            const proxies = res.data.split('\r\n').filter((p: string) => p.trim() !== "");
            freeProxyPool = proxies;
            
            if (freeProxyPool.length > 0) {
                broadcast("success", `Loaded ${freeProxyPool.length} free IPs into the rotation matrix.`, "System");
            } else {
                throw new Error("Empty proxy list returned.");
            }
        } catch (error) {
            broadcast("warning", "Failed to fetch free proxies. Defaulting to local IP.", "System");
            return undefined;
        }
    }

    if (freeProxyPool.length === 0) return undefined;

    // Pick a random proxy from the pool and remove it so we don't reuse it immediately
    const randomIndex = Math.floor(Math.random() * freeProxyPool.length);
    const selectedProxy = freeProxyPool.splice(randomIndex, 1)[0];

    return `http://${selectedProxy}`;
};