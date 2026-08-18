import dns from "dns/promises";
import { broadcast } from "./logger";
import { globalState } from "../index";

let consecutiveFailures = 0;
const MAX_FAILURES = 3; // Must fail 3 times in a row before triggering cryo-sleep

export const startNetworkMonitor = () => {
  setInterval(async () => {
    try {
      // Fast DNS lookup test to public resolvers
      await dns.lookup("google.com");

      if (consecutiveFailures >= MAX_FAILURES) {
        broadcast("success", "Connection Restored. All engine operations resuming...", "Network");
        // 🚀 THE FIX: Actually tell the engine loops to resume!
        globalState.isDiscoveryPaused = false;
        globalState.isEnrichmentPaused = false;
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;

      if (consecutiveFailures === MAX_FAILURES) {
        broadcast("error", "Network Drop! Engine entering cryo-sleep. State preserved in SQLite.", "Network");
        // 🚀 THE FIX: Actually force the engine loops to pause!
        globalState.isDiscoveryPaused = true;
        globalState.isEnrichmentPaused = true;
      }
    }
  }, 5000);
};