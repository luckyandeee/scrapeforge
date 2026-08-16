import { MongoClient, MongoClientOptions } from 'mongodb';
import { broadcast } from './logger';

// 🚀 SRV vs DIRECT CONNECTION FALLBACK (Dynamic runtime evaluation)
const getPrimaryUri = () => process.env.MONGO_URI || "";
const getFallbackUri = () => process.env.MONGO_URI_FALLBACK || "";

export const hasMongoConfig = (): boolean => Boolean(getPrimaryUri() || getFallbackUri());

const isSrvResolutionError = (error: any): boolean => {
  const msg = String(error?.message || "");
  return msg.includes('querySrv') || msg.includes('ENOTFOUND') || msg.includes('ETIMEOUT') || msg.includes('EAI_AGAIN') || msg.includes('DNS');
};

// Sticky preference: once we learn which URI actually works on this machine/network, try that one
// first on subsequent calls instead of re-attempting a doomed SRV lookup (with its own connection
// timeout) on every single caller. Reset only if the preferred one itself starts failing.
let preferredUri: string | null = null;

export const connectMongoWithFallback = async (options: MongoClientOptions = {}): Promise<MongoClient> => {
  const primary = getPrimaryUri();
  const fallback = getFallbackUri();

  const orderedCandidates = preferredUri === fallback
    ? [fallback, primary]
    : [primary, fallback];
  const candidates = orderedCandidates.filter(Boolean);

  if (candidates.length === 0) {
    throw new Error("No MONGO_URI or MONGO_URI_FALLBACK configured in the environment.");
  }

  let lastError: any = null;
  for (const uri of candidates) {
    try {
      const client = new MongoClient(uri, options);
      await client.connect();
      if (preferredUri !== uri) {
        preferredUri = uri;
        broadcast("info", `Cloud connection established via ${uri === primary ? "primary (SRV)" : "fallback (direct)"} URI.`, "Database");
      }
      return client;
    } catch (error: any) {
      lastError = error;
      // Only worth trying the next candidate if this looked like a DNS/SRV-specific failure —
      // otherwise (bad password, IP not whitelisted, etc.) trying a different URI won't help and
      // just delays surfacing the real error to the caller.
      if (!isSrvResolutionError(error)) break;
    }
  }
  throw lastError;
};