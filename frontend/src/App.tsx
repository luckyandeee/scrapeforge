import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Play, Pause, Monitor, Terminal, Activity, MapPin, Mail, Phone, Globe, Trash2,
  UserCheck, RefreshCw, ChevronLeft, ChevronRight, Folder, Search, Tag,
  Map as MapIcon, Zap, FileText, Network, XCircle, TableProperties, BatteryCharging, Lock, AlertTriangle, Cpu, HardDrive,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

/* ============================================================================
   DESIGN SYSTEM
   ----------------------------------------------------------------------------
   Palette   bg-void #020617 · panel rgba(255,255,255,.03) · line rgba(255,255,255,.08)
             signal-cyan #22d3ee (discovery / live)  ·  signal-violet #d946ef (AI / classification)
             ok #34d399  ·  warn #fbbf24  ·  danger #fb7185  ·  ink #e2e8f0 / #64748b
   Type      Display -> "Space Grotesk"  (brand, section titles)
             UI      -> "Inter"          (labels, body, controls)
             Data    -> "JetBrains Mono" (telemetry, figures, badges, logs)
   Radius    2xl panels / xl cards / lg controls / full pills
   Motion    one signature pulse (live status), everything else quiet + respects
             prefers-reduced-motion
   ========================================================================== */

const FONT_AWESOME_CDN_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
const FONT_AWESOME_LINK_ID = "scrapeforge-fontawesome-cdn";

const useFontAwesomeCDN = () => {
  useEffect(() => {
    if (document.getElementById(FONT_AWESOME_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_AWESOME_LINK_ID;
    link.rel = "stylesheet";
    link.href = FONT_AWESOME_CDN_URL;
    link.crossOrigin = "anonymous";
    link.referrerPolicy = "no-referrer";
    link.onerror = () => console.warn("[ScrapeForge] Font Awesome CDN failed to load — brand icons will render blank.");
    document.head.appendChild(link);
  }, []);
};

const GlobalStyle = () => {
  useFontAwesomeCDN();
  return (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    :root{
      --font-display:'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
      --font-sans:'Inter', ui-sans-serif, system-ui, sans-serif;
      --font-mono:'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
      --c-cyan:#22d3ee; --c-violet:#d946ef; --c-ok:#34d399; --c-warn:#fbbf24; --c-danger:#fb7185;
    }
    body{ font-family:var(--font-sans); background:#020617; }
    .font-display{ font-family:var(--font-display) !important; }
    .font-mono{ font-family:var(--font-mono) !important; letter-spacing:0.01em; }

    ::-webkit-scrollbar{ width:7px; height:7px; }
    ::-webkit-scrollbar-track{ background:transparent; }
    ::-webkit-scrollbar-thumb{ background:rgba(34,211,238,0.18); border-radius:10px; }
    ::-webkit-scrollbar-thumb:hover{ background:rgba(34,211,238,0.42); }

    .status-pill{ display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:8px; font-size:9px; letter-spacing:0.18em; }
    .status-synced{ color:#22d3ee; border:1px solid rgba(34,211,238,.35); background:rgba(34,211,238,.08); }
    .status-buffer{ color:#fb923c; border:1px solid rgba(251,146,60,.35); background:rgba(251,146,60,.08); }
    .status-dry{ color:#e879f9; border:1px solid rgba(232,121,249,.35); background:rgba(232,121,249,.08); }

    .glass-panel{ background:rgba(2,6,23,0.55); border:1px solid rgba(255,255,255,0.08); backdrop-filter:blur(18px); }
    .surface{ background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.08); }

    .btn-focus{ outline:none; }
    .btn-focus:focus-visible{ box-shadow:0 0 0 2px #020617, 0 0 0 4px rgba(34,211,238,0.55); }

    @keyframes shimmer{ 0%{ width:8%; opacity:.6 } 50%{ width:78%; opacity:1 } 100%{ width:8%; opacity:.6 } }
    @keyframes fadeIn{ from{ opacity:0 } to{ opacity:1 } }
    @keyframes pulse-cyan{ 0%,100%{ opacity:1 } 50%{ opacity:.55 } }
    .animate-fadeIn{ animation:fadeIn .4s ease-out both; }

    @media (prefers-reduced-motion: reduce){
      *, *::before, *::after{ animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important; }
    }

    @media print{
      body *{ visibility:hidden; }
      #admin-print-table, #admin-print-table *{ visibility:visible; color:#000 !important; }
      #admin-print-table{ position:absolute; left:0; top:0; width:100%; }
      .no-print{ display:none !important; }
    }
  `}</style>
  );
};

const MobileBlocker = () => (
  <div className="fixed inset-0 z-[9999] bg-[#020617] flex flex-col items-center justify-center p-6 text-center lg:hidden selection:bg-cyan-500/30">
    <GlobalStyle />
    <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#0d2040,transparent)] pointer-events-none" />
    <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

    <div className="z-10 bg-black/60 backdrop-blur-xl border border-rose-500/30 p-8 rounded-2xl shadow-[0_0_60px_rgba(225,29,72,0.12)] flex flex-col items-center w-full max-w-sm">
      <div className="relative mb-6">
        <div className="absolute -inset-4 rounded-full bg-rose-500/15 blur-xl motion-reduce:hidden" />
        <div className="relative w-16 h-16 rounded-2xl border border-rose-500/40 bg-black/60 flex items-center justify-center shadow-[0_0_30px_rgba(225,29,72,0.25)]">
          <Monitor size={30} className="text-rose-400" />
        </div>
      </div>
      <h1 className="text-xl font-display font-extrabold text-rose-400 tracking-widest uppercase mb-2 leading-tight">Desktop Required</h1>
      <div className="h-px w-16 bg-rose-500/50 my-4" />
      <p className="text-slate-400 font-sans text-sm leading-relaxed">
        ScrapeForge needs a minimum screen width of <strong className="text-rose-300 font-mono">1024px</strong> (laptop or desktop) to safely run the intelligence matrix and live telemetry.
      </p>
      <div className="mt-6 flex items-center gap-2 text-rose-400/90 font-mono text-[10px] uppercase tracking-wider bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">
        <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping motion-reduce:animate-none" />
        Please continue on a laptop or desktop
      </div>
    </div>
  </div>
);

// 🚀 FIX: Passed isEngineRunning so metrics conditionally poll
const HardwareMetricsGauge = ({ isEngineRunning }: { isEngineRunning: boolean }) => {
  const [metrics, setMetrics] = useState({
    cpuPercent: 0,
    usedMemGB: "0",
    totalMemGB: 0,
    ramPercent: 0,
    powerMode: "PERFORMANCE",
    isAutoThrottled: false,
    isAutoPaused: false,
    tier: "UNKNOWN"
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await axios.get("/api/system/metrics");
        if (res.data?.success) {
          setMetrics(res.data.data);
        }
      } catch {}
    };

    fetchMetrics(); // Always grab a baseline snapshot

    // 🚀 Conditional Polling: Halt network requests if the engine is idle
    if (!isEngineRunning) return;

    const interval = setInterval(fetchMetrics, 3000);
    return () => clearInterval(interval);
  }, [isEngineRunning]); // Re-runs this effect hook when engine starts/stops

  const getCpuColor = (pct: number) => {
    if (pct > 80) return "text-rose-400 border-rose-500/30 bg-rose-500/[0.06]";
    if (pct > 50) return "text-amber-400 border-amber-500/30 bg-amber-500/[0.06]";
    return "text-cyan-400 border-cyan-500/30 bg-cyan-500/[0.06]";
  };
  const getRamColor = (pct: number) => {
    if (pct > 85) return "text-rose-400 border-rose-500/30 bg-rose-500/[0.06]";
    if (pct > 70) return "text-amber-400 border-amber-500/30 bg-amber-500/[0.06]";
    return "text-emerald-400 border-emerald-500/30 bg-emerald-500/[0.06]";
  };

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${getCpuColor(metrics.cpuPercent)}`}>
        <Cpu size={12} className={metrics.cpuPercent > 70 ? "animate-pulse motion-reduce:animate-none" : ""} />
        <span>CPU <strong className="font-bold">{metrics.cpuPercent}%</strong></span>
      </div>
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${getRamColor(metrics.ramPercent)}`}>
        <HardDrive size={12} className={metrics.ramPercent > 80 ? "animate-pulse motion-reduce:animate-none" : ""} />
        <span>RAM <strong className="font-bold">{metrics.usedMemGB}/{metrics.totalMemGB}GB</strong> ({metrics.ramPercent}%)</span>
      </div>
      <div className={`px-2.5 py-1.5 rounded-lg border uppercase tracking-wider font-bold ${
        metrics.isAutoPaused ? "bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse motion-reduce:animate-none" :
        metrics.isAutoThrottled ? "bg-amber-500/15 text-amber-300 border-amber-500/40 animate-pulse motion-reduce:animate-none" :
        "surface text-slate-400"
      }`}>
        {metrics.isAutoPaused ? "RAM HALT" : metrics.isAutoThrottled ? "AUTO ECO" : metrics.powerMode}
      </div>
    </div>
  );
};

const resolveTwinBackendURL = async (): Promise<string> => {
  const w = window as any;
  if (w.electronAPI && w.electronAPI.getBackendPort) {
    try {
      const port = await w.electronAPI.getBackendPort();
      if (port) return `http://localhost:${port}`;
    } catch {}
  }
  const params = new URLSearchParams(window.location.search);
  const explicitPort = params.get("backend");
  if (explicitPort) return `http://localhost:${explicitPort}`;
  const currentFrontendPort = window.location.port ? parseInt(window.location.port, 10) : 5173;
  let targetBackendPort = 4000;
  if (currentFrontendPort >= 5173) targetBackendPort = 4000 + (currentFrontendPort - 5173);
  try {
    const res = await axios.get(`http://localhost:${targetBackendPort}/api/system/port-info`, { timeout: 300 });
    if (res.data && res.data.success) return `http://localhost:${res.data.port}`;
  } catch {
    for (let p = 4000; p <= 4009; p++) {
      try {
        const check = await axios.get(`http://localhost:${p}/api/system/port-info`, { timeout: 200 });
        if (check.data && check.data.success) return `http://localhost:${p}`;
      } catch {}
    }
  }
  return "http://localhost:4000";
};
axios.defaults.baseURL = "http://localhost:4000";

const PRIVACY_TEXT = `PRIVACY POLICY & DATA COLLECTION DISCLOSURE
Effective Date: August 17, 2026

1. 100% LOCAL DATA ARCHITECTURE
ScrapeForge operates strictly as a local-only desktop client. All extracted data, harvested datasets, application logs, configurations, and local session files remain stored exclusively on your personal machine's hard drive inside a local SQLite database. 

2. ZERO TELEMETRY & NO CLOUD SYNC
We do not track your usage, nor do we collect, view, or sync your harvested datasets. There is no centralized cloud infrastructure or database attached to this software. Your data never leaves your computer.

3. THIRD-PARTY APIs
The software may communicate directly with external providers (such as GitHub for checking software updates or map providers for spatial queries) strictly based on your usage. We do not intermediate or proxy these requests.

4. USER AS DATA FIDUCIARY
Because ScrapeForge has zero access to the data you collect, you (the User) act as the sole Data Fiduciary. You are entirely responsible for protecting, managing, and securing the datasets you build.`;

const TERMS_TEXT = `OPEN SOURCE LICENSE & COMPLIANCE AGREEMENT

1. OPEN SOURCE LICENSE
ScrapeForge is provided as an open-source software utility distributed under the MIT License. You are granted a limited, revocable license to install and use this software.

2. USER AS SOLE DATA FIDUCIARY
By using this software, you assume 100% legal responsibility for ensuring your data extraction activities comply with all applicable local and international privacy laws, including the DPDP Act, GDPR, and CCPA. 

3. PLATFORM TERMS OF SERVICE (ToS)
You acknowledge that automated data extraction may violate the Terms of Service, acceptable use policies, or robots.txt directives of target websites. You assume full legal responsibility for evaluating the legality of your scraping activities. 

4. NO LIABILITY FOR BANS OR DAMAGES
The developers of ScrapeForge bear absolutely ZERO LIABILITY if your IP address is blocked, your network is rate-limited, or any of your accounts are suspended or permanently banned by third-party platforms. 

5. DISCLAIMER OF WARRANTIES
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. WE DO NOT WARRANT THAT IT WILL BE ERROR-FREE OR UNINTERRUPTED. IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY DAMAGES ARISING OUT OF THE USE OF THE SOFTWARE.`;

const ScrapeForgeLogo = ({ size = 42 }: { size?: number }) => (
  <img
    src="./icon.ico"
    alt="ScrapeForge Shield"
    style={{ width: `${size}px`, height: `${size}px`, filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.55))', flexShrink: 0, borderRadius: '10px', objectFit: 'cover' }}
  />
);

interface Business {
  id: number;
  campaign_name: string;
  name: string;
  website: string;
  industry: string;
  main_category: string;
  sub_category: string;
  profession: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  executive_names: string;
  status: string;
  source?: string;
  social_links?: string;
  ai_summary?: string;
}
interface LogEvent { timestamp: string; level: string; source: string; message: string; }
interface SystemAlert {
  state: 'CRITICAL_PAUSE' | 'RESUMED_ECO' | 'THROTTLED_ECO' | 'THROTTLE_RELEASED';
  freeMemGB: number;
  mode: string;
}

const exportToExcelCSV = (data: any[], filename: string) => {
  if (data.length === 0) return alert("No data to export.");
  const headers = ["Entity Name", "Category", "Phone", "Email", "City", "Website", "Source"];
  const cleanField = (val: any) => (!val || val === "Not found" || val === "null") ? "" : String(val).replace(/"/g, '""');

  const csvContent = [
    headers.join(","),
    ...data.map(b => [
      `"${cleanField(b.name)}"`,
      `"${cleanField(b.profession || b.industry)}"`,
      cleanField(b.phone) ? `="` + cleanField(b.phone) + `"` : '""',
      `"${cleanField(b.email)}"`,
      `"${cleanField(b.city)}"`,
      `"${cleanField(b.website)}"`,
      `"${cleanField(b.source)}"`
    ].join(","))
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

// ==========================================
// 🚀 SOCIAL ACCOUNT MANAGER UI COMPONENT
// ==========================================
// 🚀 FIX: Passed isEngineRunning to conditionally control polling loops
const SocialAccountManager = ({ isEngineRunning }: { isEngineRunning: boolean }) => {
  const [socialStatuses, setSocialStatuses] = useState<Record<string, boolean>>({
    "LinkedIn-Native": false,
    "FB-Native": false,
    "Insta-Native": false
  });
  const [loadingEngine, setLoadingEngine] = useState<string | null>(null);
  
  const fetchStatuses = async () => {
    try {
      const res = await axios.get("/api/social/status");
      if (res.data?.success) {
        setSocialStatuses(res.data.statuses);
      }
    } catch {}
  };
  
  useEffect(() => {
    fetchStatuses();

    // 🚀 Conditional Polling: Stop spamming social checks if scraping is paused
    if (!isEngineRunning) return;

    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [isEngineRunning]);
  
  const handleConnect = async (engine: string) => {
    setLoadingEngine(engine);
    try {
      await axios.post("/api/social/connect", { engine });
      await fetchStatuses();
    } catch {
      alert(`Failed to authenticate ${engine}`);
    } finally {
      setLoadingEngine(null);
    }
  };
  
  const handleDisconnect = async (engine: string) => {
    if (!confirm(`Are you sure you want to unlink ${engine}?`)) return;
    setLoadingEngine(engine);
    try {
      await axios.post("/api/social/disconnect", { engine });
      await fetchStatuses();
    } catch {
      alert(`Failed to disconnect ${engine}`);
    } finally {
      setLoadingEngine(null);
    }
  };
  
  return (
    <div className="glass-panel rounded-xl p-4 shadow-[0_0_25px_rgba(6,182,212,0.06)]">
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <h3 className="text-xs font-display font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
          <Globe size={14} /> Social Matrix Auth
        </h3>
        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Isolated sessions</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { key: "LinkedIn-Native", label: "LinkedIn", faIcon: "fa-brands fa-linkedin-in", accent: "#38bdf8" },
          { key: "FB-Native", label: "Facebook", faIcon: "fa-brands fa-facebook-f", accent: "#818cf8" },
          { key: "Insta-Native", label: "Instagram", faIcon: "fa-brands fa-instagram", accent: "#e879f9" }
        ].map(({ key, label, faIcon, accent }) => {
          const isLinked = socialStatuses[key];
          const isLoading = loadingEngine === key;
          return (
            <div key={key} className="p-3.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 flex flex-col items-center gap-2.5 transition-colors">
              <div className="relative">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center border transition-colors"
                  style={{
                    color: accent,
                    borderColor: isLinked ? `${accent}66` : "rgba(255,255,255,0.14)",
                    background: isLinked ? `${accent}17` : "rgba(255,255,255,0.03)"
                  }}
                >
                  <i className={`${faIcon} text-[18px] leading-none`} aria-hidden="true" />
                </div>
                <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 border-[#050505] ${isLinked ? "bg-emerald-500 text-black" : "bg-slate-700 text-slate-300"}`}>
                  <i className={`fa-solid ${isLinked ? "fa-circle-check" : "fa-circle-exclamation"} text-[10px] leading-none`} aria-hidden="true" />
                </span>
              </div>

              <div className="text-center">
                <p className="text-xs font-semibold font-sans text-slate-200">{label}</p>
                <p className={`text-[9px] font-mono uppercase tracking-wider mt-0.5 ${isLinked ? "text-emerald-400" : "text-slate-500"}`}>
                  {isLinked ? "Linked" : "Unlinked"}
                </p>
              </div>

              <button
                onClick={() => (isLinked ? handleDisconnect(key) : handleConnect(key))}
                disabled={isLoading}
                aria-label={isLinked ? `Unlink ${label}` : `Connect ${label}`}
                className={`btn-focus w-full text-[10px] font-bold font-mono py-1.5 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 uppercase disabled:opacity-50 ${
                  isLinked
                    ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/35"
                    : "bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/35"
                }`}
              >
                <i className={`fa-solid ${isLoading ? "fa-arrows-rotate fa-spin" : isLinked ? "fa-link-slash" : "fa-link"} text-[11px] leading-none`} aria-hidden="true" />
                {isLinked ? "Unlink" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 3. PUBLIC MAIN SCRAPER WORKSPACE
// ==========================================
const MainDashboard = () => {
  const [isReady, setIsReady] = useState(false);
  const [bootStatus, setBootStatus] = useState("Initializing ScrapeForge Matrix...");

  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [isEcoLocked, setIsEcoLocked] = useState(false);
  const [hardwareTier, setHardwareTier] = useState("UNKNOWN");
  const [systemAlert, setSystemAlert] = useState<SystemAlert | null>(null);

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [contactFilter, _setContactFilter] = useState("any");
  const [stats, setStats] = useState({ total: 0, pending: 0, processed: 0, highValue: 0, phones: 0, emails: 0, sources: {} as Record<string, number> });
  const [discoveryPaused, setDiscoveryPaused] = useState(true);
  const [enrichmentPaused, setEnrichmentPaused] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [requirePhone, setRequirePhone] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [legalModal, setLegalModal] = useState<{isOpen: boolean, type: 'privacy' | 'terms' | null}>({isOpen: false, type: null});

  const filteredLogs = logs.filter(log => {
    if (logFilter !== "all" && log.level !== logFilter) return false;
    if (logSearch) {
      const term = logSearch.toLowerCase();
      return log.message?.toLowerCase().includes(term) || log.source?.toLowerCase().includes(term);
    }
    return true;
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [discovery, setDiscovery] = useState({ campaign_name: "", profession: "Interior Designers", location: "Hyderabad" });
  const [activeVector, setActiveVector] = useState({ profession: "STANDBY", location: "STANDBY" });

  const isEngineRunning = activeVector.profession !== "STANDBY";

  useEffect(() => {
    if (!isReady) return;
    let eventSource: EventSource | null = null;
    const w = window as any;
    
    if (w.electronAPI && w.electronAPI.getHardwareProfile) {
      w.electronAPI.getHardwareProfile().then((data: any) => {
        setHardwareTier(data.profile?.tier || "UNKNOWN");
        setLowPowerMode(data.currentMode);
        setIsEcoLocked(data.isLowPowerLocked);
      });
    }
    
    if (w.electronAPI && w.electronAPI.onSystemStatusChange) {
      w.electronAPI.onSystemStatusChange((data: SystemAlert) => {
        setSystemAlert(data);
        setLowPowerMode(data.mode === 'Eco');
        if (data.state === 'CRITICAL_PAUSE') {
          setDiscoveryPaused(true);
        } else if (data.state === 'RESUMED_ECO') {
          if (activeVector.profession !== "STANDBY") setDiscoveryPaused(false);
        }
      });
    }
    const initializeConnection = async () => {
      const activeBaseURL = await resolveTwinBackendURL();
      axios.defaults.baseURL = activeBaseURL;
      eventSource = new EventSource(`${activeBaseURL}/api/stream`);

      eventSource.onmessage = (event) => {
        try {
          const newLog = JSON.parse(event.data);
          setLogs((prev) => [...prev, newLog].slice(-150));
        } catch {}
      };
      axios.post("/api/system/boot")
        .then(res => console.log("Engine ignition response:", res.data))
        .catch(err => console.error("Engine ignition failed:", err));
    };
    initializeConnection();
    return () => {
      if (eventSource) eventSource.close();
    };
  }, [isReady]); // Intentionally omitting activeVector to avoid re-triggering SSE

  useEffect(() => {
    const w = window as any;
    if (w.electron) {
      w.electron.onStatus((message: string) => {
        setBootStatus(message);
        if (message.includes('All engines verified')) setTimeout(() => setIsReady(true), 1500);
      });
    } else {
      setTimeout(() => setBootStatus("Mounting SQLite Database..."), 1000);
      setTimeout(() => setBootStatus("Checking Chromium Drivers..."), 2000);
      setTimeout(() => { setBootStatus("All engines verified! Starting ScrapeForge..."); setTimeout(() => setIsReady(true), 1000); }, 3000);
    }
  }, []);

  const handleEcoToggleChange = async (checked: boolean) => {
    if (isEcoLocked) return;
    const w = window as any;
    if (w.electronAPI && w.electronAPI.setPowerMode) {
      const res = await w.electronAPI.setPowerMode(checked);
      setLowPowerMode(res.mode);
      if (res.blocked) {
         setSystemAlert(prev => prev ? { ...prev, state: 'THROTTLED_ECO' } as SystemAlert : null);
      }
    } else {
      setLowPowerMode(checked);
    }
  };

  const EngineBootLoadingScreen = ({ bootStatus }: { bootStatus: string }) => (
    <div className="absolute inset-0 z-50 bg-[#020617]/92 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-fadeIn">
      <div className="relative mb-6">
        <div className="absolute -inset-4 rounded-full bg-cyan-500/15 blur-xl motion-reduce:hidden" />
        <div className="relative w-16 h-16 rounded-2xl border border-cyan-500/40 bg-black/60 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)]">
          <Activity size={30} className="text-cyan-400 animate-spin" />
        </div>
      </div>

      <h2 className="text-lg font-display font-black text-cyan-400 tracking-widest uppercase mb-2 text-center">
        Initializing ScrapeForge Matrix
      </h2>
      <p className="text-slate-400 font-sans text-xs text-center max-w-sm mb-6 leading-relaxed">
        Performing secure pre-flight auth checks, warming up headless spiders, and mounting local databases...
      </p>
      <div className="w-64 h-1.5 bg-white/10 rounded-full overflow-hidden relative border border-white/5">
        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-600 animate-[shimmer_2s_infinite] motion-reduce:animate-none motion-reduce:w-1/2" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-cyan-400/85 font-mono text-[11px] uppercase tracking-wider bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping motion-reduce:animate-none" />
        {bootStatus || "Synchronizing background subsystems..."}
      </div>
    </div>
  );

  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const fetchDashboardData = async () => {
    if (!isReady) return;
    try {
      const [bizRes, statsRes, campRes, vecRes] = await Promise.all([
        axios.get(`/api/businesses`, {
          params: {
            limit: 100,
            page: page,
            status: filterStatus,
            campaign: filterCampaign,
            contact: contactFilter,
            search: searchTerm,
            city: cityFilter
          }
        }),
        axios.get(`/api/stats?campaign=${encodeURIComponent(filterCampaign)}`),
        axios.get("/api/campaigns"),
        axios.get("/api/vector"),
      ]);
      setBusinesses(bizRes.data.data || []);
      setStats(statsRes.data.data || { total: 0, pending: 0, processed: 0, highValue: 0, phones: 0, emails: 0, sources: {} });
      setCampaigns(campRes.data.data || []);
      if (vecRes.data.success) {
        setActiveVector({ profession: vecRes.data.data.profession, location: vecRes.data.data.location });
        setDiscoveryPaused(vecRes.data.data.isDiscoveryPaused);
        setEnrichmentPaused(vecRes.data.data.isEnrichmentPaused);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };
  
  // Load data immediately on page/filter change
  useEffect(() => { fetchDashboardData(); }, [page, filterStatus, filterCampaign, isReady]);

  // 🚀 FIX: Conditionally construct the interval loop so it doesn't DDoS local resources when idle!
  useEffect(() => {
    if (!isReady) return;
    if (!isEngineRunning) return; // Halt loop completely if engine is not running

    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval); // Destroy loop when engine pauses or component unmounts
  }, [page, filterStatus, filterCampaign, isReady, isEngineRunning]);

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discovery.campaign_name || !discovery.profession || !discovery.location) return alert("Fill all fields.");
    localStorage.setItem(`scrapeforge_cfg_${discovery.campaign_name}`, JSON.stringify(discovery));
    setLogs([]);
    setFilterCampaign(discovery.campaign_name);
    setDiscoveryPaused(false);
    setEnrichmentPaused(false);
    setActiveVector({ profession: discovery.profession, location: discovery.location });

    const payload = { ...discovery, lowPowerMode };
    await axios.post("/api/scrape/discover", payload);
    fetchDashboardData();
  };
  
  const toggleDiscovery = async () => {
    const newState = !discoveryPaused;
    setDiscoveryPaused(newState);
    if (!newState) {
      await axios.post("/api/control/discovery/resume", { campaign_name: discovery.campaign_name, profession: discovery.profession, location: discovery.location, limit: (discovery as any).limit || 0 });
    } else {
      await axios.post("/api/control/discovery/pause");
    }
    fetchDashboardData();
  };
  
  const toggleEnrichment = async () => {
    const newState = !enrichmentPaused;
    setEnrichmentPaused(newState);
    if (!newState) {
      await axios.post("/api/control/enrichment/resume");
    } else {
      await axios.post("/api/control/enrichment/pause");
    }
    fetchDashboardData();
  };
  
  const deleteActiveCampaign = async () => {
    if (filterCampaign === "all") return;
    if (!confirm(`Are you sure you want to purge the entire '${filterCampaign}' matrix? This cannot be undone.`)) return;
    setLogs([]);
    setActiveVector({ profession: "STANDBY", location: "STANDBY" });
    await axios.delete(`/api/campaigns/${encodeURIComponent(filterCampaign)}`);
    setFilterCampaign("all");
    fetchDashboardData();
  };
  
  const handleStop = async () => {
    try {
      await axios.post("/api/control/stop");
      setActiveVector({ profession: "STANDBY", location: "STANDBY" });
      setDiscoveryPaused(true);
      setEnrichmentPaused(true);
      setLogs((prev) => [...prev, { timestamp: new Date().toISOString(), level: "warning", source: "SYSTEM", message: "Kill signal transmitted. Engine halting." }].slice(-150));
      fetchDashboardData();
    } catch { alert("Failed to send kill signal."); }
  };
  
  const handleExportPDF = async () => {
    if (filteredLeads.length === 0) return alert("No payload available to export.");
    setIsExporting(true);
    try {
      const payload = { campaign: filterCampaign, ids: selectedIds.length > 0 ? selectedIds : [] };
      const response = await axios.post("/api/scrape/export/pdf", payload, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filterCampaign !== "all" ? `${filterCampaign.replace(/\s+/g, "_")}_Report.pdf` : "ScrapeForge_Report.pdf");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch { alert("Failed to generate PDF Report."); } finally { setIsExporting(false); }
  };

  const filteredLeads = businesses.filter((biz) => {
    const p = biz.phone ? String(biz.phone).toLowerCase() : "";
    const e = biz.email ? String(biz.email).toLowerCase() : "";
    const hasP = p !== "" && p !== "not found" && p !== "null" && p !== "-";
    const hasE = e !== "" && e !== "not found" && e !== "null" && e !== "-";
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!(biz.name?.toLowerCase().includes(term) || biz.industry?.toLowerCase().includes(term) || biz.profession?.toLowerCase().includes(term))) return false;
    }
    if (cityFilter) {
      const cTerm = cityFilter.toLowerCase();
      if (!(biz.city?.toLowerCase().includes(cTerm) || biz.address?.toLowerCase().includes(cTerm))) return false;
    }
    
    if (requirePhone && !hasP) return false;
    if (requireEmail && !hasE) return false;
    return true;
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredLeads.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 95,
    overscan: 10,
  });

  const handleCampaignSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    setFilterCampaign(selected); setPage(1); setDiscoveryPaused(true); setEnrichmentPaused(true);
    if (selected === "all") { setDiscovery(prev => ({ ...prev, campaign_name: "" })); return; }
    const cached = localStorage.getItem(`scrapeforge_cfg_${selected}`);
    if (cached) { setDiscovery(JSON.parse(cached)); return; }
    setDiscovery(prev => ({ ...prev, campaign_name: selected, limit: "", requirement: "any" }));
    try {
      const res = await axios.get(`/api/businesses?limit=1&page=1&status=all&campaign=${encodeURIComponent(selected)}`);
      if (res.data.success && res.data.data.length > 0) {
        const sample = res.data.data[0];
        setDiscovery(prev => ({
          ...prev,
          location: sample.city && sample.city !== "Not found" && sample.city !== "null" ? sample.city : prev.location,
          profession: sample.profession && sample.profession !== "Not found" && sample.profession !== "null" ? sample.profession : prev.profession,
        }));
      }
    } catch {}
  };

  let currentViewTotal = stats.total || 0;
  if (filterStatus === "processed") currentViewTotal = stats.processed || 0;
  if (filterStatus === "pending_verification") currentViewTotal = stats.pending || 0;
  const itemsPerPage = 100;
  const totalPages = Math.max(1, Math.ceil(currentViewTotal / itemsPerPage));

  return (
    <div className="h-screen w-screen bg-[#020617] text-slate-300 flex flex-col font-sans overflow-hidden selection:bg-cyan-500/30 relative">
      <GlobalStyle />
      
      {!isReady && <EngineBootLoadingScreen bootStatus={bootStatus} />}

      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_900px_at_50%_-8%,#0d2040,transparent)] pointer-events-none" />

      {systemAlert && (
        <div className={`px-4 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs z-50 shrink-0 border-b shadow-lg transition-all duration-300 ${
          systemAlert.state === 'CRITICAL_PAUSE' ? 'bg-rose-500/15 text-rose-400 border-rose-500/40' :
          systemAlert.state === 'THROTTLED_ECO' || systemAlert.state === 'RESUMED_ECO' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40' :
          'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {systemAlert.state === 'CRITICAL_PAUSE' ? <AlertTriangle size={14} className="animate-pulse motion-reduce:animate-none" /> : <Activity size={14} />}
            <strong>{systemAlert.state === 'CRITICAL_PAUSE' ? "CRITICAL SYSTEM HALT:" : "SYSTEM ALERT:"}</strong>
            <span>
              {systemAlert.state === 'CRITICAL_PAUSE' && ` OS RAM critically low (${systemAlert.freeMemGB.toFixed(2)}GB). Spiders auto-paused to protect OS.`}
              {systemAlert.state === 'THROTTLED_ECO' && ` High memory load detected (${systemAlert.freeMemGB.toFixed(2)}GB). Engine downshifted to ECO Mode.`}
              {systemAlert.state === 'RESUMED_ECO' && ` RAM recovering (${systemAlert.freeMemGB.toFixed(2)}GB). Auto-resuming operations in ECO Mode.`}
              {systemAlert.state === 'THROTTLE_RELEASED' && ` System stabilized (${systemAlert.freeMemGB.toFixed(2)}GB). Restrictions lifted.`}
            </span>
          </div>
          {systemAlert.state === 'THROTTLE_RELEASED' && (
            <button onClick={() => setSystemAlert(null)} aria-label="Dismiss alert" className="btn-focus hover:text-white transition-colors p-1"><XCircle size={14} /></button>
          )}
        </div>
      )}

      <header className="border-b border-white/5 bg-[#0f172a]/95 backdrop-blur-md px-3.5 lg:px-5 xl:px-6 py-3 xl:py-3.5 flex flex-col 2xl:flex-row 2xl:items-center justify-between shadow-2xl z-40 shrink-0 gap-3 relative">
        <div className="flex flex-wrap items-center gap-3 xl:gap-4 justify-between 2xl:justify-start">
          <div className="flex items-center gap-3">
            <ScrapeForgeLogo size={38} />
            <div>
              <h1 className="text-base lg:text-lg xl:text-xl font-display font-black tracking-widest text-cyan-400 leading-tight drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">SCRAPEFORGE</h1>
              <p className="hidden lg:block text-[9px] text-slate-400 font-sans tracking-[0.08em] uppercase mt-0.5">Open Source Web Automation Utility</p>
            </div>
          </div>
          {/* Passed isEngineRunning down to conditionally handle the hardware stats polling */}
          <HardwareMetricsGauge isEngineRunning={isEngineRunning} />
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:gap-2.5">
          <form onSubmit={handleDiscover} className="flex flex-wrap items-center gap-1.5">
            <select className="btn-focus bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono w-[86px] text-cyan-50 cursor-pointer focus:border-cyan-500/60" value={(discovery as any).requirement || "any"} onChange={(e) => setDiscovery({ ...discovery, requirement: e.target.value } as any)}>
              <option value="any" className="bg-[#0b1220]">Any Data</option>
              <option value="phone" className="bg-[#0b1220]">Phone Only</option>
              <option value="email" className="bg-[#0b1220]">Email Only</option>
              <option value="both" className="bg-[#0b1220]">Phone + Email</option>
            </select>
            <input type="text" placeholder="Campaign" className="btn-focus bg-black/50 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] font-mono w-[104px] text-cyan-50 placeholder-slate-600 focus:border-cyan-500/60" value={discovery.campaign_name} onChange={(e) => setDiscovery({ ...discovery, campaign_name: e.target.value })} />
            <input type="text" placeholder="Keywords" className="btn-focus bg-black/50 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] font-mono w-[104px] text-cyan-50 placeholder-slate-600 focus:border-cyan-500/60" value={discovery.profession} onChange={(e) => setDiscovery({ ...discovery, profession: e.target.value })} />
            <input type="text" placeholder="Sector" className="btn-focus bg-black/50 border border-white/10 rounded-lg px-2.5 py-2 text-[11px] font-mono w-[88px] text-cyan-50 placeholder-slate-600 focus:border-cyan-500/60" value={discovery.location} onChange={(e) => setDiscovery({ ...discovery, location: e.target.value })} />
            <input type="number" placeholder="Limit" title="Target Lead Limit" className="btn-focus bg-black/50 border border-white/10 rounded-lg px-2 py-2 text-[11px] font-mono w-[60px] text-amber-400 placeholder-slate-600 text-center focus:border-amber-500/60" value={(discovery as any).limit || ""} onChange={(e) => setDiscovery({ ...discovery, limit: e.target.value } as any)} />

            <label title={isEcoLocked ? "Hardware locked to Eco Mode for stability" : "Toggle Low Power Engine"} className={`btn-focus flex items-center gap-1.5 px-2.5 py-2 rounded-lg transition-colors border ${isEcoLocked ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed' : lowPowerMode ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 cursor-pointer' : 'bg-white/5 border-white/10 text-slate-500 hover:text-white cursor-pointer'}`}>
              <input type="checkbox" checked={lowPowerMode} onChange={(e) => handleEcoToggleChange(e.target.checked)} disabled={isEcoLocked} className="hidden" />
              {isEcoLocked ? <Lock size={12} className="opacity-50" /> : <BatteryCharging size={13} className={lowPowerMode ? 'animate-pulse motion-reduce:animate-none' : ''} />}
              <span className="hidden xl:inline text-[9px] font-mono font-bold uppercase tracking-widest">{hardwareTier === "LOW" ? "LOCKED ECO" : "ECO MODE"}</span>
            </label>

            <div className="flex items-center gap-1.5">
              <button type="submit" disabled={isEngineRunning} className={`btn-focus px-3 py-2 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 tracking-wider uppercase ${isEngineRunning ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white shadow-[0_0_12px_rgba(6,182,212,0.35)]"}`}>
                <Activity size={12} className={isEngineRunning ? "animate-pulse motion-reduce:animate-none" : ""} /> {isEngineRunning ? "Running" : "Ignite"}
              </button>
              <button type="button" onClick={handleStop} disabled={!isEngineRunning} className={`btn-focus px-3 py-2 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 tracking-wider uppercase ${!isEngineRunning ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.35)] border border-rose-500/50"}`}>
                <XCircle size={12} /> Stop
              </button>
            </div>
          </form>

          <div className="h-6 w-px bg-white/10 hidden xl:block mx-0.5" />

          <button onClick={toggleDiscovery} className={`btn-focus px-2.5 xl:px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${discoveryPaused ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"}`}>
            {discoveryPaused ? <><Play size={13} /> <span className="hidden xl:inline">Resume </span>Spider</> : <><Pause size={13} /> <span className="hidden xl:inline">Halt </span>Spider</>}
          </button>
          <button onClick={toggleEnrichment} className={`btn-focus px-2.5 xl:px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${enrichmentPaused ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"}`}>
            {enrichmentPaused ? <><Play size={13} /> <span className="hidden xl:inline">Resume </span>AI</> : <><Pause size={13} /> <span className="hidden xl:inline">Halt </span>AI</>}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-3 lg:p-3.5 xl:p-4 gap-3 xl:gap-4 z-10 relative">
        <div className="flex-1 flex flex-col min-w-0 glass-panel rounded-2xl shadow-2xl overflow-hidden relative">

          <div className="grid grid-cols-3 shrink-0 border-b border-white/5 bg-white/[0.02]">
            <div className="p-2.5 lg:p-3.5 xl:p-4 border-r border-white/5 relative overflow-hidden">
              <h3 className="text-cyan-500/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" /> Yield Vector</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black mt-1 text-white tracking-tight">{stats.total || 0}</p>
            </div>
            <div className="p-2.5 lg:p-3.5 xl:p-4 border-r border-white/5 relative overflow-hidden">
              <h3 className="text-orange-400/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_#fb923c] ${!enrichmentPaused ? "animate-pulse motion-reduce:animate-none" : ""}`} /> Buffer</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black mt-1 text-orange-400 tracking-tight">{stats.pending || 0}</p>
            </div>
            <div className="p-2.5 lg:p-3.5 xl:p-4 relative overflow-hidden">
              <h3 className="text-emerald-500/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Verified</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black mt-1 text-emerald-100 tracking-tight">{stats.processed || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 shrink-0 border-b border-white/5 bg-white/[0.01]">
            <div className="p-2.5 lg:p-3.5 xl:p-4 border-r border-b lg:border-b-0 border-white/5">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">High-Value Entities</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black text-cyan-400 tracking-tight">{stats.highValue || 0}</p>
            </div>
            <div className="p-2.5 lg:p-3.5 xl:p-4 lg:border-r border-b lg:border-b-0 border-white/5">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">Direct Phone Lines</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black text-emerald-400 tracking-tight">{stats.phones || 0}</p>
            </div>
            <div className="p-2.5 lg:p-3.5 xl:p-4 border-r border-white/5">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">SMTP Coordinates</h3>
              <p className="text-xl lg:text-2xl xl:text-3xl font-display font-black text-fuchsia-400 tracking-tight">{stats.emails || 0}</p>
            </div>
            <div className="p-2.5 lg:p-3.5 xl:p-4 flex flex-col justify-center">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><Network size={12}/> Network Distribution</h3>
              <div className="h-[48px] overflow-y-auto scrollbar-thin pr-1">
                {Object.entries(stats.sources || {}).map(([src, count]) => (
                  <span key={src} className="inline-block mb-1.5 mr-1.5 text-[9px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 whitespace-nowrap">{src}: <span className="text-amber-400 font-bold">{count}</span></span>
                ))}
                {Object.keys(stats.sources || {}).length === 0 && <span className="inline-block text-[9px] font-mono text-slate-600 italic">Awaiting telemetry...</span>}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-b border-white/5 bg-gradient-to-r from-[#070b13] via-[#0b1220] to-[#070b13]">
            <div className="p-2.5 lg:p-3 xl:p-3.5 flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-2.5 xl:gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 shadow-inner">
                  <Folder size={15} className="text-cyan-400 shrink-0" />
                  <select value={filterCampaign} onChange={handleCampaignSelect} className="btn-focus bg-transparent text-cyan-100 text-xs font-mono cursor-pointer">
                    <option value="all" className="bg-[#0b1220] text-cyan-100">ALL MATRICES</option>
                    {campaigns.map((c) => <option key={c} value={c} className="bg-[#0b1220] text-cyan-100">{c}</option>)}
                  </select>
                  {filterCampaign !== "all" && filterCampaign !== "" && (
                    <button onClick={deleteActiveCampaign} className="btn-focus ml-1 flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"><Trash2 size={12} /> Purge</button>
                  )}
                </div>
                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner">
                  {[["all", "RAW"], ["processed", "CLEAN"], ["pending_verification", "DIRTY"], ["contact_dry", "RESERVOIR"]].map(([value, label]) => (
                    <button key={value} onClick={() => { setFilterStatus(value); setPage(1); }} className={`btn-focus rounded-lg px-3 py-1.5 text-[11px] font-mono tracking-widest transition-all ${filterStatus === value ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold" : "text-slate-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search entities..." className="btn-focus h-10 w-40 xl:w-52 rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs font-mono text-cyan-50 placeholder:text-slate-500 focus:border-cyan-500 focus:bg-[#0b1320] transition-all shadow-inner" />
                </div>
                <div className="relative">
                  <MapIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fuchsia-400 pointer-events-none" />
                  <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="Geofence..." className="btn-focus h-10 w-28 xl:w-36 rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs font-mono text-fuchsia-50 placeholder:text-slate-500 focus:border-fuchsia-500 focus:bg-[#0b1320] transition-all shadow-inner" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner">
                  <button onClick={() => setRequirePhone(!requirePhone)} className={`btn-focus flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${requirePhone ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm" : "text-slate-400 hover:text-white"}`}><Phone size={12} /> TEL</button>
                  <button onClick={() => setRequireEmail(!requireEmail)} className={`btn-focus flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${requireEmail ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm" : "text-slate-400 hover:text-white"}`}><Mail size={12} /> SMTP</button>
                </div>

                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner gap-1">
                  <button onClick={() => exportToExcelCSV(selectedIds.length > 0 ? filteredLeads.filter(b => selectedIds.includes(b.id)) : filteredLeads, `ScrapeForge_${filterCampaign}_${Date.now()}`)} className="btn-focus h-8 rounded-lg bg-emerald-500/10 px-3 text-xs font-bold font-mono tracking-wider text-emerald-400 transition-all hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 uppercase">
                    <TableProperties size={13} /> Excel<span className="hidden xl:inline"> (CSV)</span>
                  </button>
                  <button onClick={handleExportPDF} disabled={isExporting} className="btn-focus h-8 rounded-lg bg-cyan-500/10 px-3 text-xs font-bold font-mono tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5 border border-cyan-500/30 uppercase">
                    {isExporting ? <><RefreshCw size={13} className="animate-spin" /> Rendering...</> : <><FileText size={13} /> PDF</>}
                  </button>
                </div>
                <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] shadow-inner overflow-hidden">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page" className="btn-focus p-2.5 text-cyan-400 hover:bg-white/5 disabled:opacity-20 transition-colors"><ChevronLeft size={15} /></button>
                  <span className="min-w-[85px] text-center text-[11px] font-mono font-bold text-slate-300 tracking-wider">PG {page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} aria-label="Next page" className="btn-focus p-2.5 text-cyan-400 hover:bg-white/5 disabled:opacity-20 transition-colors"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          </div>

          <div ref={tableContainerRef} className="flex-1 overflow-auto scrollbar-thin relative bg-black/50">
            {filterCampaign === "all" ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl mb-4 text-cyan-400"><Zap size={36} /></div>
                <h2 className="text-xl font-display font-black text-white tracking-tight mb-2">NO ACTIVE HARVESTER MATRIX SELECTED</h2>
                <p className="text-xs text-slate-400 max-w-md mb-8 font-sans leading-relaxed">Select a specific campaign from the dropdown above or launch a new autonomous data capture node.</p>
              </div>
            ) : (
              <div className="w-full text-left border-collapse min-w-[900px] relative">
                <div className="sticky top-0 bg-[#030712]/95 backdrop-blur-md z-20 border-b border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-500/60 grid grid-cols-[48px_26fr_18fr_20fr_24fr_80px] px-2 py-3 items-center">
                  <div className="text-center"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? filteredLeads.map((b) => b.id) : [])} className="rounded border-white/20 bg-black/50 text-cyan-500 cursor-pointer" /></div>
                  <div className="px-2">Entity Target</div>
                  <div className="px-2">AI Classification</div>
                  <div className="px-2">Coordinates</div>
                  <div className="px-2">Footprint</div>
                  <div className="text-center">Status</div>
                </div>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }} className="w-full text-xs font-sans pt-3">
                  {loading ? <div className="p-12 text-center text-cyan-500/60 font-mono tracking-widest animate-pulse motion-reduce:animate-none">Initializing Database Link...</div> : filteredLeads.length === 0 ? <div className="p-12 text-center text-slate-500 font-mono tracking-widest">No target matches in current buffer.</div> : (
                    rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const biz = filteredLeads[virtualRow.index];
                      const isSynced = biz.status === "processed";
                      const isDry = biz.status === "contact_dry";
                      return (
                        <div key={biz.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }} className="w-full px-3 pb-3">
                          <div className="w-full grid grid-cols-[48px_26fr_18fr_20fr_24fr_80px] items-center bg-black/50 border border-white/10 hover:border-cyan-400/60 rounded-xl px-3 py-4 transition-colors duration-200 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] hover:bg-cyan-500/[0.04] group">

                            <div className="flex justify-center items-center">
                              <input type="checkbox" checked={selectedIds.includes(biz.id)} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, biz.id] : prev.filter((id) => id !== biz.id))} className="rounded border-white/20 bg-black/50 text-cyan-500 cursor-pointer w-4 h-4" />
                            </div>
                            <div className="px-2 min-w-0 space-y-1">
                              <div className="font-bold text-slate-100 text-[13px] group-hover:text-cyan-300 transition-colors truncate">{biz.name}</div>
                              <a href={biz.website} target="_blank" rel="noreferrer" className="text-cyan-500/80 hover:text-cyan-300 font-mono flex items-center gap-1.5 text-[10px] truncate"><Globe size={10} className="shrink-0 text-cyan-400" /><span className="truncate">{biz.website}</span></a>
                              {biz.source && <div className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-fuchsia-400/90 bg-fuchsia-500/10 w-max px-2 py-0.5 rounded-md border border-fuchsia-500/30 truncate"><Tag size={9} className="shrink-0" /><span className="truncate">{biz.source}</span></div>}
                            </div>
                            <div className="px-2 min-w-0 space-y-1.5">
                              {isSynced ? (
                                <div className="flex flex-col gap-1.5 truncate">
                                  <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30 w-max uppercase tracking-wider">{biz.industry || "Unknown Entity"}</span>
                                  <span className="text-slate-300 text-[11px] font-semibold tracking-tight truncate">{biz.profession}</span>
                                </div>
                              ) : isDry ? (
                                <div className="flex flex-col gap-1.5 truncate">
                                  <span className="text-[9px] font-mono text-fuchsia-300 bg-fuchsia-500/15 px-2 py-0.5 rounded-md border border-fuchsia-500/30 w-max uppercase tracking-wider">RESERVOIR</span>
                                  <span className="text-slate-400 text-[10px] italic truncate">{biz.ai_summary || "Contact Dry"}</span>
                                </div>
                              ) : (
                                <span className="text-amber-400 text-[10px] font-mono tracking-wider flex items-center gap-1.5"><RefreshCw size={11} className="animate-spin shrink-0"/>Decrypting...</span>
                              )}
                            </div>
                            <div className="px-2 space-y-1.5 font-mono text-[10px] min-w-0">
                              {biz.executive_names && biz.executive_names !== "Not found" && biz.executive_names !== "null" && <div className="text-fuchsia-300 bg-fuchsia-500/15 px-2 py-0.5 rounded-md border border-fuchsia-500/30 w-max flex gap-1.5 items-center font-bold truncate max-w-full"><UserCheck size={11} className="shrink-0 text-fuchsia-400" /><span className="truncate">{biz.executive_names}</span></div>}
                              <div className="flex gap-2 text-slate-300 truncate"><Mail size={12} className="text-cyan-400 shrink-0 mt-0.5" /><span className="truncate">{biz.email !== "Not found" ? biz.email : "ERR_NO_SMTP"}</span></div>
                              <div className="flex gap-2 text-slate-300 truncate"><Phone size={12} className="text-cyan-400 shrink-0 mt-0.5" /><span className="truncate">{biz.phone !== "Not found" ? biz.phone : "ERR_NO_TEL"}</span></div>
                              {biz.city && biz.city !== "Not found" && <div className="flex gap-2 text-slate-400 truncate"><MapPin size={12} className="text-emerald-400 shrink-0 mt-0.5" /><span className="truncate">{biz.city}</span></div>}
                            </div>
                            <div className="px-2 min-w-0">
                              {biz.social_links && biz.social_links !== "Not found" && biz.social_links !== "null" ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {biz.social_links.split(',').map((link, idx) => {
                                    const cleanLink = link.trim();
                                    if (!cleanLink || cleanLink === "Not found") return null;
                                    let label = "LINK";
                                    if (cleanLink.includes("linkedin.com")) label = "LNKD";
                                    if (cleanLink.includes("instagram.com")) label = "INST";
                                    if (cleanLink.includes("facebook.com")) label = "FACE";
                                    if (cleanLink.includes("twitter.com") || cleanLink.includes("x.com")) label = "XCOM";
                                    if (cleanLink.includes("whatsapp.com") || cleanLink.includes("wa.me")) label = "WAPP";
                                    return <a key={idx} href={cleanLink} target="_blank" rel="noreferrer" className="btn-focus inline-flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-cyan-500/20 text-slate-300 transition-all truncate"><Globe size={9} className="shrink-0 text-cyan-400" />{label}</a>;
                                  })}
                                </div>
                              ) : <span className="text-slate-600 text-[10px] font-mono italic">NO_VECTORS</span>}
                            </div>
                            <div className="flex justify-center items-center">
                              <span className={
                                isSynced ? "status-pill status-synced" :
                                isDry ? "status-pill status-dry" :
                                "status-pill status-buffer"
                              }>
                                {isSynced ? "VERIFIED" : isDry ? "DRY" : "BUFFER"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TELEMETRY SIDEBAR (Always Visible) */}
        <div className="w-full lg:w-[300px] xl:w-[380px] 2xl:w-[440px] flex flex-col gap-3 xl:gap-4 shrink-0">

          {/* Passed isEngineRunning down to conditionally handle social status polling */}
          <SocialAccountManager isEngineRunning={isEngineRunning} />

          <div className="glass-panel rounded-xl flex flex-col shadow-[0_0_25px_rgba(217,70,239,0.06)] relative overflow-hidden p-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
              <div className="flex items-center gap-2 text-fuchsia-400 font-display text-[11px] font-bold tracking-[0.25em] uppercase"><span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-ping motion-reduce:animate-none" /> Active Target Vector</div>
              <span className="text-[9px] font-mono text-fuchsia-500/70 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/20">
                {isEngineRunning ? "LIVE_SCAN" : "SYSTEM_HALTED"}
              </span>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center bg-white/[0.02] p-2 rounded border border-white/5"><span className="text-slate-500 text-[10px] uppercase flex items-center gap-1.5"><Tag size={12}/> Keywords:</span><span className="text-cyan-300 font-bold">{activeVector.profession}</span></div>
              <div className="flex justify-between items-center bg-white/[0.02] p-2 rounded border border-white/5"><span className="text-slate-500 text-[10px] uppercase flex items-center gap-1.5"><MapPin size={12}/> Location:</span><span className="text-amber-300 font-bold">{activeVector.location}</span></div>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] lg:min-h-0 bg-[#04060c] border border-white/10 rounded-xl flex flex-col shadow-2xl relative overflow-hidden">
            <div className="p-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2 bg-black/60 shrink-0">
              <div className="flex items-center gap-2 text-cyan-400 font-display text-[11px] font-bold tracking-[0.25em] uppercase"><Terminal size={14} className={isEngineRunning ? "animate-pulse motion-reduce:animate-none" : ""} /> Uplink Telemetry</div>
              <div className="flex items-center gap-3">
                <div className="relative"><Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500/50" /><input type="text" placeholder="Search logs..." value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="btn-focus bg-white/5 border border-white/10 rounded px-2 pl-6 py-1 text-[9px] font-mono text-cyan-100 placeholder-slate-600 w-28 sm:w-32" /></div>
                <div className="hidden sm:flex gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500/70" /><span className="w-2 h-2 rounded-full bg-amber-500/70" /><span className="w-2 h-2 rounded-full bg-emerald-500/70" /></div>
              </div>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 bg-black/40 border-b border-white/5 shrink-0 overflow-x-auto scrollbar-none">
              {['all', 'info', 'success', 'warning', 'error'].map(lvl => (
                <button key={lvl} onClick={() => setLogFilter(lvl)} className={`btn-focus text-[9px] font-mono px-2 py-0.5 rounded border uppercase transition-colors ${logFilter === lvl ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "text-slate-500 border-transparent hover:text-slate-300"}`}>{lvl}</button>
              ))}
            </div>
            <div className="flex-1 p-3.5 overflow-y-auto font-mono text-[10px] space-y-1.5 scrollbar-thin bg-black text-emerald-500/80">
              {filteredLogs.length === 0 && logs.length > 0 && <div className="text-slate-600 italic">No logs match filters.</div>}
              {filteredLogs.map((log, i) => (
                <div key={i} className={`pl-3 border-l-2 py-0.5 pr-2 rounded-r ${log.level === "error" ? "text-rose-400 border-rose-500 bg-rose-500/[0.06]" : log.level === "success" ? "text-cyan-400 border-cyan-500 bg-cyan-500/[0.04]" : log.level === "warning" ? "text-amber-400 border-amber-500 bg-amber-500/[0.06]" : "text-emerald-500 border-emerald-700"}`}>
                  <span className="text-slate-600 text-[9px] mr-2">[{log.timestamp?.split("T")[1]?.substring(0, 8) || "LIVE"}]</span>
                  {log.source && <span className="text-slate-400 text-[9px] mr-2 tracking-wider">[{log.source}]</span>}
                  <span>{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </main>

      {/* Legal Footer */}
      <footer className="w-full py-3 px-4 lg:px-6 mt-auto border-t border-white/5 bg-slate-950/60 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-40">
        <p>© 2026 ScrapeForge Contributors. Open Source (MIT).</p>
        <div className="flex items-center gap-4 font-medium">
          <button onClick={() => setLegalModal({isOpen: true, type: 'privacy'})} className="btn-focus hover:text-cyan-400 transition-colors">
            Privacy Policy
          </button>
          <span className="text-slate-700">•</span>
          <button onClick={() => setLegalModal({isOpen: true, type: 'terms'})} className="btn-focus hover:text-cyan-400 transition-colors">
            Terms of Service
          </button>
        </div>
      </footer>

      {/* Legal Text Modal Overlay */}
      {legalModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-cyan-500/30 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-[0_0_60px_rgba(6,182,212,0.12)] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="font-display text-cyan-400 font-bold uppercase tracking-widest text-sm">
                {legalModal.type === 'privacy' ? 'Privacy Policy & Data Disclosure' : 'End User License Agreement'}
              </h2>
              <button onClick={() => setLegalModal({isOpen: false, type: null})} aria-label="Close" className="btn-focus text-slate-400 hover:text-rose-400 transition-colors p-1"><XCircle size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed scrollbar-thin">
              {legalModal.type === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT}
            </div>
            <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
               <button onClick={() => setLegalModal({isOpen: false, type: null})} className="btn-focus px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-mono text-xs uppercase tracking-wider transition-colors">Acknowledge &amp; Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 4. MAIN APPLICATION ROUTER
// ==========================================
export default function App() {
  return (
    <>
      <MobileBlocker />
      <MainDashboard />
    </>
  );
}