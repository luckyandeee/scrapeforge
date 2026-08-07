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
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      
      if (consecutiveFailures === MAX_FAILURES) {
        broadcast("error", "Network Drop! Engine entering cryo-sleep. State preserved in SQLite.", "Network");
      }
    }
  }, 5000);
};