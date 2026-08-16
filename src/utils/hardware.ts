import os from "os";
import { broadcast } from "./logger";

export interface SystemProfile {
  tier: "LOW" | "MEDIUM" | "HIGH";
  totalRamGB: number;
  cpuCores: number;
  recommendedModel: string;
  ollamaOptions: {
    num_ctx: number;
    num_thread: number;
    temperature: number;
    top_k: number;
    top_p: number;
  };
}

export const detectHardwareProfile = (): SystemProfile => {
  const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  const cpuCores = os.cpus().length;

  broadcast(
    "info",
    `🖥️ Hardware Profiler: ${totalRamGB}GB RAM detected | ${cpuCores} CPU Cores available.`,
    "System"
  );

  // 🚀 SINGLE UNIFIED MODEL: qwen2.5:0.5b (~398MB download size, ~600MB VRAM/RAM footprint)
  // Keeps the installer small and inference lightning fast (<100ms per entity).
  const BASE_MODEL = "qwen2.5:0.5b";

  // 🚀 TIER 1: HIGH SPEC (>= 16GB RAM)
  // Capped at 2 threads max so multi-threaded Playwright scrapers run smoothly.
  if (totalRamGB >= 16 && cpuCores >= 6) {
    broadcast("success", "⚡ Hardware Profile: HIGH PERFORMANCE (Lean AI Mode)", "System");
    return {
      tier: "HIGH",
      totalRamGB,
      cpuCores,
      recommendedModel: BASE_MODEL,
      ollamaOptions: {
        num_ctx: 2048,      // Compact context window
        num_thread: 2,       // STRICT CAP: Leaves remaining 4+ cores for Playwright
        temperature: 0.1,
        top_k: 10,
        top_p: 0.8
      }
    };
  }

  // 🚀 TIER 2: MEDIUM SPEC (8GB - 15GB RAM)
  // Capped at 2 threads with a smaller context window.
  if (totalRamGB >= 8) {
    broadcast("info", "⚡ Hardware Profile: BALANCED (Eco AI Mode)", "System");
    return {
      tier: "MEDIUM",
      totalRamGB,
      cpuCores,
      recommendedModel: BASE_MODEL,
      ollamaOptions: {
        num_ctx: 1024,      // Sufficient for business text extraction
        num_thread: 2,       // Strictly capped at 2 cores
        temperature: 0.1,
        top_k: 10,
        top_p: 0.8
      }
    };
  }

  // 🚀 TIER 3: LOW SPEC (< 8GB RAM)
  // Single-threaded execution to prevent thermal throttling or out-of-memory errors.
  broadcast("warning", "⚡ Hardware Profile: ECO-MODE (Single Core AI)", "System");
  return {
    tier: "LOW",
    totalRamGB,
    cpuCores,
    recommendedModel: BASE_MODEL,
    ollamaOptions: {
      num_ctx: 768,        // Ultra-compact context
      num_thread: 1,       // Uses only 1 CPU core for LLM
      temperature: 0.1,
      top_k: 5,
      top_p: 0.8
    }
  };
};

// Export active system profile singleton
export const ACTIVE_HARDWARE_PROFILE = detectHardwareProfile();