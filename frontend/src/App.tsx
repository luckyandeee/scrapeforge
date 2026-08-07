import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Play, Pause, Terminal, Activity, MapPin, Mail, Phone, Globe, Trash2, 
  UserCheck, RefreshCw, ChevronLeft, ChevronRight, Folder, Search, Tag, 
  Map as MapIcon, Zap, FileText, Network, XCircle, Lock, Key, User, LogOut, Database, Layers, TableProperties, Printer, AlertTriangle
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

const PRIVACY_TEXT = `PRIVACY POLICY & DATA COLLECTION DISCLOSURE
Effective Date: August 7, 2026
Company: VSS Gowri Tech Online Private Limited

1. DATA COLLECTION & STORAGE ARCHITECTURE
- Centralized Data Aggregation: ScrapeForge operates locally as a desktop client, but scraped data, harvested datasets, and operational outputs are transmitted to and stored within our centralized MongoDB database infrastructure.
- Local Storage: Local app configurations, app logs, and authentication session tokens (such as cookies) remain stored locally on your machine.
- Local AI Processing: Features powered by Ollama execute locally on your machine's hardware. Prompt context is not transmitted to our cloud servers.

2. NETWORK ACTIVITY
- MongoDB Sync: Communicates securely with our MongoDB cluster to push harvested rows and telemetry.
- External APIs: Uses Map providers according to their policies, and GitHub for software updates.

3. WHAT WE DO NOT COLLECT
- We do not harvest, store, or view your social media passwords or sensitive master credentials.
- We do not use your datasets for external third-party advertising.`;

const TERMS_TEXT = `END USER LICENSE AGREEMENT (EULA) & TERMS OF SERVICE

1. GRANT OF LICENSE
VSS Gowri Tech Online Private Limited grants you a limited, revocable license to install and use ScrapeForge strictly for internal business operations.

2. PERMITTED AND RESTRICTED USE
You shall not reverse engineer, decompile, or attempt to discover the source code. You shall not rent, lease, or resell the Software.

3. THIRD-PARTY PLATFORMS & ACCOUNTS
You acknowledge that you are solely responsible for maintaining the security of your accounts and session tokens. VSS Gowri Tech Online Private Limited bears zero liability if your accounts are flagged, locked, or banned by any third-party platform. You assume 100% legal responsibility for ensuring your actions comply with target platform policies.

4. DISCLAIMER
THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DO NOT WARRANT THAT IT WILL BE ERROR-FREE OR UNINTERRUPTED.

5. LIMITATION OF LIABILITY
IN NO EVENT SHALL VSS GOWRI TECH ONLINE PRIVATE LIMITED BE LIABLE FOR ANY DAMAGES (INCLUDING LOSS OF PROFITS, DATA, OR ACCOUNT BANS) ARISING OUT OF THE USE OF THE SOFTWARE.`;

const ScrapeForgeLogo = () => (
  <img 
    src="./icon.ico" 
    alt="ScrapeForge Shield" 
    style={{ width: '42px', height: '42px', filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.6))', flexShrink: 0, borderRadius: '8px', objectFit: 'cover' }} 
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

// --- REUSABLE CSV EXPORTER (EXCEL SAFE) ---
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
// OLLAMA STATUS BANNER COMPONENT
// ==========================================
const OllamaStatusBanner = () => {
  const [status, setStatus] = useState<{ success: boolean; code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const w = window as any;
        if (w.electronAPI?.getOllamaStatus) {
          const res = await w.electronAPI.getOllamaStatus();
          setStatus(res);
          w.electronAPI.onDownloadProgress((percent: number) => {
            setProgress(percent);
          });
        }
      } catch {
        setStatus({ success: false, code: 'ERROR', message: "Could not communicate with local Ollama manager." });
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    setProgress(0);
    const w = window as any;
    if (w.electronAPI?.installOllama) {
      const res = await w.electronAPI.installOllama();
      setStatus(res);
      if (!res.success && res.code !== 'INSTALLING') {
        setInstalling(false);
      }
    }
  };

  if (loading) return null;

  // 1. Success (Green)
  if (status?.success) {
    return (
      <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg flex items-center justify-between text-xs font-mono mb-4 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>AI Engine Ready: {status.message}</span>
        </div>
      </div>
    );
  }

  // 2. Hardware Unsupported (Yellow/Amber)
  if (status?.code === 'UNSUPPORTED') {
    return (
      <div className="bg-amber-950/40 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-xl flex flex-col gap-2 mb-4 text-xs font-mono shadow-[0_0_20px_rgba(245,158,11,0.1)]">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-amber-400">
          <AlertTriangle size={14} />
          <span>AI Enrichment Disabled</span>
        </div>
        <p className="text-amber-200/80">{status.message}</p>
        <p className="text-[10px] text-amber-500/70 italic mt-1">Core scraping engine is operating normally in basic mode.</p>
      </div>
    );
  }

  // 3. Missing/Needs Install (Red)
  return (
    <div className="bg-rose-950/50 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl flex flex-col gap-3 mb-4 text-xs font-mono shadow-[0_0_20px_rgba(244,63,94,0.15)]">
      <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-rose-400">
        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
        <span>AI Engine Missing</span>
      </div>
      <p className="text-rose-200/80">{status?.message}</p>
      
      {installing ? (
        <div className="flex flex-col gap-1 w-full max-w-xs mt-1">
          <span className="text-[9px] text-cyan-400 tracking-widest uppercase">Downloading Installer... {progress}%</span>
          <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden border border-white/10">
            <div className="bg-cyan-500 h-1.5 transition-all duration-300" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mt-1">
          <button onClick={handleInstall} className="inline-flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all shadow-[0_0_10px_rgba(6,182,212,0.4)]">
            <Zap size={12} className="mr-1.5" /> 1-Click Install AI Engine
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 1. SYSTEM LOCK (ADMIN LOGIN)
// ==========================================
const LoginScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError("");
    try {
      const res = await axios.post("http://localhost:4000/api/auth/login", { username, password });
      if (res.data.success) {
        localStorage.setItem("scrapeforge_admin_auth", "true");
        onLogin();
      }
    } catch {
      setError("ACCESS DENIED. INVALID CREDENTIALS.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden selection:bg-cyan-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#0d2040,transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <div className="z-10 bg-black/60 backdrop-blur-xl border border-cyan-500/30 p-8 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] w-full max-w-md flex flex-col items-center">
        <ScrapeForgeLogo />
        <h1 className="text-2xl font-black text-cyan-400 font-mono mt-4 tracking-widest">MASTER PORTAL</h1>
        <p className="text-slate-500 font-mono text-[10px] uppercase tracking-widest mt-1 mb-8">Admin Authorization Required</p>
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
          <div className="relative">
            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-500/50" />
            <input type="text" placeholder="Admin ID" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm font-mono text-cyan-50 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors" required />
          </div>
          <div className="relative">
            <Key size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-fuchsia-500/50" />
            <input type="password" placeholder="Passcode" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm font-mono text-fuchsia-50 placeholder-slate-600 focus:outline-none focus:border-fuchsia-500 transition-colors" required />
          </div>
          {error && <div className="text-rose-500 text-[10px] font-mono font-bold text-center tracking-wider bg-rose-500/10 py-2 rounded-lg border border-rose-500/20 animate-pulse">{error}</div>}
          <button type="submit" disabled={isAuthenticating} className="mt-4 w-full bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-mono font-bold uppercase tracking-widest py-3 rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all hover:scale-[1.02] disabled:opacity-50 flex items-center justify-center gap-2">
            {isAuthenticating ? <RefreshCw size={16} className="animate-spin" /> : <Lock size={16} />}
            {isAuthenticating ? "Verifying..." : "Access Master Database"}
          </button>
        </form>
        <a href="#/" className="mt-6 flex items-center gap-1.5 text-[10px] font-mono text-slate-500 hover:text-cyan-400 transition-colors uppercase tracking-widest"><ChevronLeft size={12} /> Back to ScrapeForge Workspace</a>
      </div>
    </div>
  );
};

// ==========================================
// 2. ADMIN CLOUD DATA HARVEST MATRIX
// ==========================================
const AdminMasterView = ({ onLogout }: { onLogout: () => void }) => {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalRecords, setTotalRecords] = useState(0);
  const [contactFilter, _setContactFilter] = useState("any");

  const itemsPerPage = 50;
  const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

  useEffect(() => {
    let isMounted = true;

    const fetchCloudData = async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      try {
        const res = await axios.get("http://localhost:4000/api/cloud/entities", {
          params: { page, limit: itemsPerPage, campaign: selectedCampaign, category: selectedCategory, search: searchQuery, contact: contactFilter }
        });
        if (isMounted) {
          setBusinesses(res.data.data || []);
          setTotalRecords(res.data.total || 0);
        }
      } catch {
      } finally {
        if (isMounted && !isSilent) setLoading(false);
      }
    };

    const fetchCloudMetadata = async () => {
      try {
        const res = await axios.get("http://localhost:4000/api/cloud/metadata");
        if (isMounted && res.data.success) {
          setCampaigns(res.data.campaigns || []);
          setProfessions(res.data.categories || []);
        }
      } catch {}
    };

    const debounce = setTimeout(() => {
      fetchCloudData(false);
      fetchCloudMetadata();
    }, 400);

    const interval = setInterval(() => {
      fetchCloudData(true);
      fetchCloudMetadata();
    }, 10000);

    return () => {
      isMounted = false;
      clearTimeout(debounce);
      clearInterval(interval);
    };
  }, [page, selectedCampaign, selectedCategory, searchQuery, contactFilter]);

  const handlePDFPrint = () => {
    window.print();
  };

  return (
    <div className="h-screen w-screen bg-[#020617] text-slate-300 flex flex-col font-sans overflow-hidden relative">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #admin-print-table, #admin-print-table * { visibility: visible; color: black !important; }
          #admin-print-table { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>
      
      <header className="border-b border-cyan-500/20 bg-[#070d19] px-6 py-4 flex items-center justify-between shadow-2xl z-50 no-print">
        <div className="flex items-center gap-4">
          <ScrapeForgeLogo />
          <div>
            <h1 className="text-xl font-black tracking-widest text-cyan-400 flex items-center gap-2"><Database size={20} className="text-cyan-400 animate-pulse" /> CLOUD MASTER ARCHIVE</h1>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">Admin Telemetry & Global Deduplicated Harvest</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => exportToExcelCSV(businesses, `Master_Cloud_${Date.now()}`)} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white font-mono font-bold text-xs rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-2 uppercase tracking-wider transition-all"><TableProperties size={14} /> EXCEL (CSV)</button>
          <button onClick={handlePDFPrint} className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white font-mono font-bold text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center gap-2 uppercase tracking-wider transition-all"><Printer size={14} /> PDF / PRINT</button>
          <button onClick={onLogout} className="p-2 ml-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl transition-all"><LogOut size={16} /></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
        <div className="grid grid-cols-3 gap-4 shrink-0 no-print">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-center">
            <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">Total Cloud Entities</h3>
            <p className="text-3xl font-black text-white tracking-tight">{totalRecords.toLocaleString()}</p>
          </div>
          <div className="bg-black/40 border border-cyan-500/20 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-center shadow-[0_0_20px_rgba(6,182,212,0.05)]">
            <h3 className="text-cyan-500/70 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">Active Campaigns</h3>
            <p className="text-3xl font-black text-cyan-400 tracking-tight">{campaigns.length}</p>
          </div>
          <div className="bg-black/40 border border-fuchsia-500/20 rounded-2xl p-5 backdrop-blur-md flex flex-col justify-center shadow-[0_0_20px_rgba(217,70,239,0.05)]">
            <h3 className="text-fuchsia-500/70 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">Unique Categories</h3>
            <p className="text-3xl font-black text-fuchsia-400 tracking-tight">{professions.length}</p>
          </div>
        </div>

        <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md no-print">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <Folder size={15} className="text-cyan-400" />
              <select value={selectedCampaign} onChange={(e) => { setSelectedCampaign(e.target.value); setPage(1); }} className="bg-transparent text-xs font-mono text-cyan-100 outline-none cursor-pointer w-40 truncate">
                <option value="all" className="bg-[#0b1220]">ALL CAMPAIGNS</option>
                {campaigns.map(c => <option key={c} value={c} className="bg-[#0b1220]">{c}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <Layers size={15} className="text-fuchsia-400" />
              <select value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }} className="bg-transparent text-xs font-mono text-fuchsia-100 outline-none cursor-pointer w-40 truncate">
                <option value="all" className="bg-[#0b1220]">ALL CATEGORIES</option>
                {professions.map(p => <option key={p} value={p} className="bg-[#0b1220]">{p}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
              <Phone size={15} className="text-emerald-400" />
              <select value={contactFilter} onChange={(e) => { _setContactFilter(e.target.value); setPage(1); }} className="bg-transparent text-xs font-mono text-emerald-100 outline-none cursor-pointer w-32 truncate">
                <option value="any" className="bg-[#0b1220]">ANY DATA</option>
                <option value="phone" className="bg-[#0b1220]">PHONE ONLY</option>
                <option value="email" className="bg-[#0b1220]">EMAIL ONLY</option>
                <option value="both" className="bg-[#0b1220]">PHONE + EMAIL</option>
              </select>
            </div>
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Search entities in cloud..." className="h-9 w-64 rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-xs font-mono text-cyan-50 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 text-cyan-400 hover:bg-white/5 disabled:opacity-20"><ChevronLeft size={16} /></button>
            <span className="px-4 text-xs font-mono font-bold text-slate-300">PG {page} / {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="p-2 text-cyan-400 hover:bg-white/5 disabled:opacity-20"><ChevronRight size={16} /></button>
          </div>
        </div>

        <div className="flex-1 bg-black/60 border border-white/10 rounded-2xl overflow-auto scrollbar-thin p-4 backdrop-blur-xl">
          <table id="admin-print-table" className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-white/10 font-mono text-[10px] uppercase text-cyan-400 tracking-wider">
                <th className="p-3">#</th>
                <th className="p-3">Entity Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Email</th>
                <th className="p-3">City</th>
                <th className="p-3 text-right">Sync Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs font-sans">
              {loading ? (
                <tr><td colSpan={7} className="p-12 text-center text-cyan-500/50 font-mono tracking-widest animate-pulse">Querying MongoDB Cluster...</td></tr>
              ) : businesses.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-slate-500 font-mono tracking-widest">No harvested records found in Cloud.</td></tr>
              ) : (
                businesses.map((b, idx) => (
                  <tr key={b._id || idx} className="hover:bg-cyan-500/5 transition-colors group">
                    <td className="p-3 font-mono text-slate-500">{(page - 1) * itemsPerPage + idx + 1}</td>
                    <td className="p-3 font-bold text-white truncate max-w-[250px] group-hover:text-cyan-300">{b.name}</td>
                    <td className="p-3 font-mono text-fuchsia-300 truncate max-w-[150px]"><span className="bg-fuchsia-500/10 px-2 py-1 rounded border border-fuchsia-500/20">{b.profession || b.industry}</span></td>
                    <td className="p-3 font-mono text-emerald-400">{b.phone !== 'Not found' ? b.phone : '-'}</td>
                    <td className="p-3 font-mono text-cyan-400 truncate max-w-[200px]">{b.email !== 'Not found' ? b.email : '-'}</td>
                    <td className="p-3 text-slate-300">{b.city !== 'Not found' ? b.city : '-'}</td>
                    <td className="p-3 font-mono text-slate-500 text-[10px] text-right">{new Date(b.cloud_synced_at).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

// ==========================================
// 3. PUBLIC MAIN SCRAPER WORKSPACE
// ==========================================
const MainDashboard = () => {
  const [isReady, setIsReady] = useState(false);
  const [bootStatus, setBootStatus] = useState("Initializing ScrapeForge Matrix...");
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

  // Secret Admin Lock Logic
  const [lockClickCount, setLockClickCount] = useState(0);
  const [lockLastClickTime, setLockLastClickTime] = useState(0);
  const [lockMessage, setLockMessage] = useState("");

  // Legal Modal State
  const [legalModal, setLegalModal] = useState<{isOpen: boolean, type: 'privacy' | 'terms' | null}>({isOpen: false, type: null});

  const handleAdminLockClick = () => {
    const currentTime = new Date().getTime();
    const TIME_WINDOW = 1000; // 1 second
    const REQUIRED_CLICKS = 4;

    if (currentTime - lockLastClickTime > TIME_WINDOW) {
      setLockClickCount(1);
      setLockMessage("System Secured");
      setTimeout(() => setLockMessage(""), 1500);
    } else {
      const newCount = lockClickCount + 1;
      setLockClickCount(newCount);
      if (newCount >= REQUIRED_CLICKS) {
        window.location.hash = "#/admin";
        setLockClickCount(0);
        setLockMessage("");
      }
    }
    setLockLastClickTime(currentTime);
  };

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

  useEffect(() => {
    const w = window as any;
    if (w.electron) {
      w.electron.onStatus((message: string) => {
        setBootStatus(message);
        if (message.includes('All engines verified')) setTimeout(() => setIsReady(true), 1500);
      });
    } else {
      setTimeout(() => setBootStatus("Verifying Local AI model..."), 800);
      setTimeout(() => setBootStatus("Mounting SQLite Database..."), 1500);
      setTimeout(() => setBootStatus("Checking Chromium Drivers..."), 2200);
      setTimeout(() => { setBootStatus("All engines verified! Starting ScrapeForge..."); setTimeout(() => setIsReady(true), 1000); }, 3000);
    }
  }, []);

  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  const fetchDashboardData = async () => {
    if (!isReady) return;
    try {
      const [bizRes, statsRes, campRes, vecRes] = await Promise.all([
        axios.get(`http://localhost:4000/api/businesses`, {
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
        axios.get(`http://localhost:4000/api/stats?campaign=${encodeURIComponent(filterCampaign)}`),
        axios.get("http://localhost:4000/api/campaigns"),
        axios.get("http://localhost:4000/api/vector"),
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

  useEffect(() => { fetchDashboardData(); }, [page, filterStatus, filterCampaign, isReady]);

  useEffect(() => {
    if (!isReady) return;
    const interval = setInterval(fetchDashboardData, 6000);
    const sse = new EventSource("http://localhost:4000/api/stream");
    sse.onmessage = (e) => {
      const newLog = JSON.parse(e.data);
      setLogs((prev) => [...prev, newLog].slice(-150));
    };
    return () => { clearInterval(interval); sse.close(); };
  }, [page, filterStatus, filterCampaign, isReady]);

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discovery.campaign_name || !discovery.profession || !discovery.location) return alert("Fill all fields.");
    localStorage.setItem(`scrapeforge_cfg_${discovery.campaign_name}`, JSON.stringify(discovery));
    setLogs([]); 
    setFilterCampaign(discovery.campaign_name);
    setDiscoveryPaused(false);
    setEnrichmentPaused(false);
    setActiveVector({ profession: discovery.profession, location: discovery.location });
    await axios.post("http://localhost:4000/api/scrape/discover", discovery);
    fetchDashboardData();
  };

  const toggleDiscovery = async () => {
    const newState = !discoveryPaused;
    setDiscoveryPaused(newState);
    if (!newState) {
      await axios.post("http://localhost:4000/api/control/discovery/resume", { campaign_name: discovery.campaign_name, profession: discovery.profession, location: discovery.location, limit: (discovery as any).limit || 0 });
    } else {
      await axios.post("http://localhost:4000/api/control/discovery/pause");
    }
    fetchDashboardData();
  };

  const toggleEnrichment = async () => {
    const newState = !enrichmentPaused;
    setEnrichmentPaused(newState);
    if (!newState) {
      await axios.post("http://localhost:4000/api/control/enrichment/resume");
    } else {
      await axios.post("http://localhost:4000/api/control/enrichment/pause");
    }
    fetchDashboardData();
  };

  const deleteActiveCampaign = async () => {
    if (filterCampaign === "all") return;
    if (!confirm(`Are you sure you want to purge the entire '${filterCampaign}' matrix? This cannot be undone.`)) return;
    setLogs([]);
    setActiveVector({ profession: "STANDBY", location: "STANDBY" });
    await axios.delete(`http://localhost:4000/api/campaigns/${encodeURIComponent(filterCampaign)}`);
    setFilterCampaign("all");
    fetchDashboardData();
  };

  const handleStop = async () => {
    try {
      await axios.post("http://localhost:4000/api/control/stop");
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
      const response = await axios.post("http://localhost:4000/api/scrape/export/pdf", payload, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filterCampaign !== "all" ? `${filterCampaign.replace(/\s+/g, "_")}_Report.pdf` : "ScrapeForge_Report.pdf");
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch { alert("Failed to generate PDF Report."); } finally { setIsExporting(false); }
  };

  const isEngineRunning = activeVector.profession !== "STANDBY";

  const filteredLeads = businesses.filter((biz) => {
    const p = biz.phone ? String(biz.phone).toLowerCase() : "";
    const e = biz.email ? String(biz.email).toLowerCase() : "";
    const hasP = p !== "" && p !== "not found" && p !== "null" && p !== "-";
    const hasE = e !== "" && e !== "not found" && e !== "null" && e !== "-";

    if (filterStatus !== "contact_dry" && !hasP && !hasE) return false;

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
      const res = await axios.get(`http://localhost:4000/api/businesses?limit=1&page=1&status=all&campaign=${encodeURIComponent(selected)}`);
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

  if (!isReady) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden">
        <style>{`
          .forge-spinner { width: 48px; height: 48px; border: 3px solid rgba(34, 211, 238, 0.1); border-radius: 50%; border-top-color: #22d3ee; animation: forge-spin 1s ease-in-out infinite; box-shadow: 0 0 20px rgba(34, 211, 238, 0.2); }
          @keyframes forge-spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,#0d2040,transparent)] pointer-events-none" />
        <ScrapeForgeLogo />
        <h1 className="text-3xl font-black text-cyan-400 font-mono mt-6 tracking-widest drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">SCRAPEFORGE</h1>
        <p className="text-slate-500 font-serif text-[11px] uppercase tracking-widest mt-2 mb-12">Powered by VSS Gowri Tech Online Private Limited</p>
        <div className="forge-spinner" />
        <p className="mt-8 text-cyan-500/80 font-mono text-xs uppercase tracking-widest animate-pulse">{bootStatus}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#020617] text-slate-300 flex flex-col font-sans overflow-hidden selection:bg-cyan-500/30 relative">
      <style>{`
        .status-synced { color: #22d3ee; border: 1px solid rgba(34, 211, 238, 0.3); background: rgba(34, 211, 238, 0.05); box-shadow: 0 0 10px rgba(34, 211, 238, 0.15); animation: pulse-cyan 2s infinite; }
        .status-buffer { color: #f97316; border: 1px solid rgba(249, 115, 22, 0.3); background: rgba(249, 115, 22, 0.05); box-shadow: 0 0 10px rgba(249, 115, 22, 0.15); }
        @keyframes pulse-cyan { 0%, 100% { opacity: 1; box-shadow: 0 0 10px rgba(34, 211, 238, 0.15); } 50% { opacity: 0.8; box-shadow: 0 0 20px rgba(34, 211, 238, 0.3); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(34, 211, 238, 0.2); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(34, 211, 238, 0.5); }
      `}</style>
      
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_200px,#0d2040,transparent)] pointer-events-none" />

      <header className="border-b border-white/5 bg-[#0f172a] px-4 py-3 lg:px-6 flex flex-col lg:flex-row lg:items-center justify-between shadow-2xl z-50 shrink-0 gap-4 relative">
        <div className="flex items-center gap-4">
          <ScrapeForgeLogo />
          <div>
            <h1 className="text-xl font-black tracking-widest text-cyan-400 leading-tight drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">SCRAPEFORGE</h1>
            <p className="text-[9px] text-slate-400 font-serif tracking-[0.1em] uppercase mt-0.5">Powered by VSS Gowri Tech Online Private Limited</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleDiscover} className="flex items-center gap-2 bg-black/50 px-3 py-1.5 border border-white/10 rounded-lg shadow-inner focus-within:border-cyan-500/50 transition-colors">
            <div className="h-4 w-[1px] bg-white/10" />
            <select className="bg-transparent text-xs font-mono focus:outline-none w-20 text-cyan-50 cursor-pointer" value={(discovery as any).requirement || "any"} onChange={(e) => setDiscovery({ ...discovery, requirement: e.target.value } as any)}>
              <option value="any" className="bg-[#0b1220]">Any Data</option>
              <option value="phone" className="bg-[#0b1220]">Phone Only</option>
              <option value="email" className="bg-[#0b1220]">Email Only</option>
              <option value="both" className="bg-[#0b1220]">Phone + Email</option>
            </select>
            <div className="h-4 w-[1px] bg-white/10" />
            <input type="text" placeholder="Campaign" className="bg-transparent text-xs font-mono focus:outline-none w-24 text-cyan-50 placeholder-slate-600" value={discovery.campaign_name} onChange={(e) => setDiscovery({ ...discovery, campaign_name: e.target.value })} />
            <div className="h-4 w-[1px] bg-white/10" />
            <input type="text" placeholder="Keywords" className="bg-transparent text-xs font-mono focus:outline-none w-24 text-cyan-50 placeholder-slate-600" value={discovery.profession} onChange={(e) => setDiscovery({ ...discovery, profession: e.target.value })} />
            <div className="h-4 w-[1px] bg-white/10" />
            <input type="text" placeholder="Sector" className="bg-transparent text-xs font-mono focus:outline-none w-20 text-cyan-50 placeholder-slate-600" value={discovery.location} onChange={(e) => setDiscovery({ ...discovery, location: e.target.value })} />
            <div className="h-4 w-[1px] bg-white/10" />
            <input type="number" placeholder="Limit" title="Target Lead Limit" className="bg-transparent text-xs font-mono focus:outline-none w-14 text-amber-400 placeholder-slate-600 text-center" value={(discovery as any).limit || ""} onChange={(e) => setDiscovery({ ...discovery, limit: e.target.value } as any)} />
            <div className="flex items-center gap-1.5 ml-1">
              <button type="submit" disabled={isEngineRunning} className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 tracking-wider uppercase ${isEngineRunning ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]"}`}>
                <Activity size={12} className={isEngineRunning ? "animate-pulse" : ""} /> {isEngineRunning ? "Running" : "Ignite"}
              </button>
              <button type="button" onClick={handleStop} disabled={!isEngineRunning} className={`px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5 tracking-wider uppercase ${!isEngineRunning ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed shadow-none" : "bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white shadow-[0_0_10px_rgba(225,29,72,0.4)] animate-pulse border border-rose-500/50"}`}>
                <XCircle size={12} /> Stop
              </button>
            </div>
          </form>
          <button onClick={toggleDiscovery} className={`px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${discoveryPaused ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20"}`}>
            {discoveryPaused ? <><Play size={14} /> Resume Spider</> : <><Pause size={14} /> Halt Spider</>}
          </button>
          <button onClick={toggleEnrichment} className={`px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${enrichmentPaused ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"}`}>
            {enrichmentPaused ? <><Play size={14} /> Resume AI</> : <><Pause size={14} /> Halt AI</>}
          </button>

          <div className="relative flex items-center ml-2">
            {lockMessage && (
              <span className="absolute right-full mr-3 whitespace-nowrap text-[9px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30 animate-pulse uppercase tracking-widest shadow-[0_0_10px_rgba(16,185,129,0.2)] pointer-events-none">
                {lockMessage}
              </span>
            )}
            <button 
              onClick={handleAdminLockClick} 
              title="Security Status" 
              className="p-2 rounded text-slate-500 hover:text-cyan-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-center focus:outline-none"
            >
              <Lock size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden p-4 gap-4 z-10 relative">
        <div className="flex-1 flex flex-col min-w-0 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden relative">
          
          <div className="grid grid-cols-3 shrink-0 border-b border-white/5 bg-white/5">
            <div className="p-3 lg:p-4 border-r border-white/5 relative overflow-hidden group">
              <h3 className="text-cyan-500/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" /> Yield Vector</h3>
              <p className="text-2xl lg:text-3xl font-black mt-1 text-white tracking-tight">{stats.total || 0}</p>
            </div>
            <div className="p-3 lg:p-4 border-r border-white/5 relative overflow-hidden group">
              <h3 className="text-[#f97316]/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full bg-[#f97316] shadow-[0_0_8px_#f97316] ${!enrichmentPaused ? "animate-pulse" : ""}`} /> Buffer</h3>
              <p className="text-2xl lg:text-3xl font-black mt-1 text-[#f97316] tracking-tight" style={{ textShadow: '0 0 10px rgba(249,115,22,0.3)' }}>{stats.pending || 0}</p>
            </div>
            <div className="p-3 lg:p-4 relative overflow-hidden group">
              <h3 className="text-emerald-500/70 text-[10px] font-mono uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> Verified</h3>
              <p className="text-2xl lg:text-3xl font-black mt-1 text-emerald-100 tracking-tight">{stats.processed || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 shrink-0 border-b border-white/5 bg-white/[0.02]">
            <div className="p-3 lg:p-4 border-r border-b lg:border-b-0 border-white/5 relative overflow-hidden">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">High-Value Entities</h3>
              <p className="text-2xl lg:text-3xl font-black text-cyan-400 tracking-tight">{stats.highValue || 0}</p>
            </div>
            <div className="p-3 lg:p-4 border-r lg:border-b-0 border-b border-white/5 relative overflow-hidden">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">Direct Phone Lines</h3>
              <p className="text-2xl lg:text-3xl font-black text-emerald-400 tracking-tight">{stats.phones || 0}</p>
            </div>
            <div className="p-3 lg:p-4 border-r border-white/5 relative overflow-hidden">
              <h3 className="text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-1">SMTP Coordinates</h3>
              <p className="text-2xl lg:text-3xl font-black text-fuchsia-400 tracking-tight">{stats.emails || 0}</p>
            </div>
            <div className="p-3 lg:p-4 relative overflow-hidden flex flex-col justify-center">
              <h3 className="relative z-10 text-slate-500 text-[10px] font-mono uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><Network size={12}/> Network Distribution</h3>
              <div className="relative z-10 h-[48px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-1 block">
                {Object.entries(stats.sources || {}).map(([src, count]) => (
                  <span key={src} className="inline-block mb-1.5 mr-1.5 text-[9px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-slate-300 whitespace-nowrap">{src}: <span className="text-amber-400 font-bold">{count}</span></span>
                ))}
                {Object.keys(stats.sources || {}).length === 0 && <span className="inline-block text-[9px] font-mono text-slate-600 italic">Awaiting telemetry...</span>}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-b border-white/5 bg-gradient-to-r from-[#070b13] via-[#0b1220] to-[#070b13] backdrop-blur-xl">
            <div className="p-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 shadow-inner">
                  <Folder size={15} className="text-cyan-400 shrink-0" />
                  <select value={filterCampaign} onChange={handleCampaignSelect} className="bg-transparent text-cyan-100 text-xs font-mono outline-none cursor-pointer">
                    <option value="all" className="bg-[#0b1220] text-cyan-100">ALL MATRICES</option>
                    {campaigns.map((c) => <option key={c} value={c} className="bg-[#0b1220] text-cyan-100">{c}</option>)}
                  </select>
                  {filterCampaign !== "all" && filterCampaign !== "" && (
                    <button onClick={deleteActiveCampaign} className="ml-1 flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"><Trash2 size={12} /> Purge</button>
                  )}
                </div>

                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner">
                  {[["all", "RAW"], ["processed", "CLEAN"], ["pending_verification", "DIRTY"], ["contact_dry", "RESERVOIR"]].map(([value, label]) => (
                    <button key={value} onClick={() => { setFilterStatus(value); setPage(1); }} className={`rounded-lg px-3 py-1.5 text-[11px] font-mono tracking-widest transition-all ${filterStatus === value ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold" : "text-slate-400 hover:text-white"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-cyan-400 pointer-events-none" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search entities..." className="h-10 w-52 rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs font-mono text-cyan-50 placeholder:text-slate-500 focus:border-cyan-500 focus:bg-[#0b1320] focus:outline-none transition-all shadow-inner" />
                </div>
                <div className="relative">
                  <MapIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fuchsia-400 pointer-events-none" />
                  <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="Geofence..." className="h-10 w-36 rounded-xl border border-white/10 bg-white/[0.03] pl-10 pr-4 text-xs font-mono text-fuchsia-50 placeholder:text-slate-500 focus:border-fuchsia-500 focus:bg-[#0b1320] focus:outline-none transition-all shadow-inner" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner">
                  <button onClick={() => setRequirePhone(!requirePhone)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${requirePhone ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm" : "text-slate-400 hover:text-white"}`}><Phone size={12} /> TEL</button>
                  <button onClick={() => setRequireEmail(!requireEmail)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${requireEmail ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm" : "text-slate-400 hover:text-white"}`}><Mail size={12} /> SMTP</button>
                </div>
                
                <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1 shadow-inner gap-1">
                  <button onClick={() => exportToExcelCSV(selectedIds.length > 0 ? filteredLeads.filter(b => selectedIds.includes(b.id)) : filteredLeads, `ScrapeForge_${filterCampaign}_${Date.now()}`)} className="h-8 rounded-lg bg-emerald-500/10 px-3 text-xs font-bold font-mono tracking-wider text-emerald-400 transition-all hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 uppercase">
                    <TableProperties size={13} /> EXCEL (CSV)
                  </button>
                  <button onClick={handleExportPDF} disabled={isExporting} className="h-8 rounded-lg bg-cyan-500/10 px-3 text-xs font-bold font-mono tracking-wider text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:opacity-50 flex items-center gap-1.5 border border-cyan-500/30 uppercase">
                    {isExporting ? <><RefreshCw size={13} className="animate-spin" /> Rendering...</> : <><FileText size={13} /> PDF</>}
                  </button>
                </div>

                <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] shadow-inner overflow-hidden">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2.5 text-cyan-400 hover:bg-white/5 disabled:opacity-20 transition-colors"><ChevronLeft size={15} /></button>
                  <span className="min-w-[85px] text-center text-[11px] font-mono font-bold text-slate-300 tracking-wider">PG {page} / {totalPages}</span>
                  <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="p-2.5 text-cyan-400 hover:bg-white/5 disabled:opacity-20 transition-colors"><ChevronRight size={15} /></button>
                </div>
              </div>
            </div>
          </div>

          <div ref={tableContainerRef} className="flex-1 overflow-auto scrollbar-thin relative backdrop-blur-2xl bg-black/60 border border-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.08)] rounded-xl">
            {filterCampaign === "all" ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-black/20">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl mt-10 mb-2 text-cyan-400"><Zap size={36} className="animate-pulse" /></div>
                <h2 className="text-xl font-black text-white tracking-tight mb-2">NO ACTIVE HARVESTER MATRIX SELECTED</h2>
                <p className="text-xs text-slate-400 max-w-md mb-8 font-mono leading-relaxed">Select a specific campaign from the dropdown above or launch a new autonomous data capture node.</p>
              </div>
            ) : (
              <div className="w-full text-left border-collapse min-w-[1000px] relative">
                <div className="sticky top-0 bg-[#030712]/95 backdrop-blur-md z-20 border-b border-white/10 text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-500/60 grid grid-cols-[48px_26fr_18fr_20fr_24fr_80px] px-2 py-3 items-center">
                  <div className="text-center"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? filteredLeads.map((b) => b.id) : [])} className="rounded border-white/20 bg-black/50 text-cyan-500 cursor-pointer" /></div>
                  <div className="px-2">Entity Target</div>
                  <div className="px-2">AI Classification</div>
                  <div className="px-2">Coordinates</div>
                  <div className="px-2">Footprint</div>
                  <div className="text-center">Status</div>
                </div>
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }} className="w-full text-xs font-sans pt-3">
                  {loading ? <div className="p-12 text-center text-cyan-500/50 font-mono tracking-widest animate-pulse">Initializing Database Link...</div> : filteredLeads.length === 0 ? <div className="p-12 text-center text-slate-500 font-mono tracking-widest">No target matches in current buffer.</div> : (
                    rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const biz = filteredLeads[virtualRow.index];
                      const isSynced = biz.status === "processed";
                      const isDry = biz.status === "contact_dry";

                      return (
                        <div key={biz.id} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }} className="w-full px-3 pb-3">
                          <div className="w-full grid grid-cols-[48px_26fr_18fr_20fr_24fr_80px] items-center bg-black/60 backdrop-blur-2xl border border-cyan-500/20 hover:border-cyan-400/80 rounded-2xl px-3 py-4 transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.25)] hover:bg-gradient-to-r hover:from-cyan-500/15 hover:via-fuchsia-500/10 hover:to-transparent group">
                            
                            <div className="flex justify-center items-center">
                              <input type="checkbox" checked={selectedIds.includes(biz.id)} onChange={(e) => setSelectedIds((prev) => e.target.checked ? [...prev, biz.id] : prev.filter((id) => id !== biz.id))} className="rounded border-white/20 bg-black/50 text-cyan-500 cursor-pointer w-4 h-4" />
                            </div>

                            <div className="px-2 min-w-0 space-y-1">
                              <div className="font-extrabold text-slate-100 text-[13px] group-hover:text-cyan-300 transition-colors tracking-wide truncate">{biz.name}</div>
                              <a href={biz.website} target="_blank" rel="noreferrer" className="text-cyan-500/80 hover:text-cyan-300 font-mono flex items-center gap-1.5 text-[10px] truncate"><Globe size={10} className="shrink-0 text-cyan-400" /><span className="truncate">{biz.website}</span></a>
                              {biz.source && <div className="flex items-center gap-1 text-[9px] font-mono tracking-widest text-fuchsia-400/90 bg-fuchsia-500/10 w-max px-2 py-0.5 rounded-md border border-fuchsia-500/30 truncate"><Tag size={9} className="shrink-0" /><span className="truncate">{biz.source}</span></div>}
                            </div>

                            <div className="px-2 min-w-0 space-y-1.5">
                              {isSynced ? (
                                <div className="flex flex-col gap-1.5 truncate">
                                  <span className="text-[9px] font-mono text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30 w-max uppercase tracking-wider">{biz.industry || "Unknown Entity"}</span>
                                  <span className="text-slate-300 text-[11px] font-bold tracking-tight truncate">{biz.profession}</span>
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
                                    return <a key={idx} href={cleanLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-cyan-500/20 text-slate-300 transition-all truncate shadow-sm"><Globe size={9} className="shrink-0 text-cyan-400" />{label}</a>;
                                  })}
                                </div>
                              ) : <span className="text-slate-600 text-[10px] font-mono italic">NO_VECTORS</span>}
                            </div>

                            <div className="flex justify-center items-center">
                              <span className={
                                isSynced ? "status-synced px-2.5 py-1.5 border rounded-lg text-[9px] font-mono tracking-[0.25em]" : 
                                isDry ? "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1.5 border rounded-lg text-[9px] font-mono tracking-[0.25em] shadow-[0_0_15px_rgba(217,70,239,0.15)]" : 
                                "status-buffer px-2.5 py-1.5 border rounded-lg text-[9px] font-mono tracking-[0.25em]"
                              }>
                                {isSynced ? "SYNCED" : isDry ? "DRY" : "BUFFER"}
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
        <div className="w-full lg:w-[450px] flex flex-col gap-4 shrink-0">
          
          <OllamaStatusBanner />

          <div className="bg-[#050505] border border-fuchsia-500/30 rounded-xl flex flex-col shadow-[0_0_20px_rgba(217,70,239,0.1)] relative overflow-hidden p-4">
            <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-500/5 to-transparent pointer-events-none" />
            <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3 z-10 relative">
              <div className="flex items-center gap-2 text-fuchsia-400 font-mono text-[11px] font-bold tracking-[0.3em] uppercase"><div className="w-2 h-2 rounded-full bg-fuchsia-400 animate-ping" /> Active Target Vector</div>
              <span className="text-[9px] font-mono text-fuchsia-500/70 bg-fuchsia-500/10 px-2 py-0.5 rounded border border-fuchsia-500/20">
                {isEngineRunning ? "LIVE_SCAN" : "SYSTEM_HALTED"}
              </span>
            </div>
            <div className="space-y-2 font-mono text-xs z-10 relative">
              <div className="flex justify-between items-center bg-white/[0.02] p-2 rounded border border-white/5"><span className="text-slate-500 text-[10px] uppercase flex items-center gap-1.5"><Tag size={12}/> Keywords:</span><span className="text-cyan-300 font-bold animate-pulse">{activeVector.profession}</span></div>
              <div className="flex justify-between items-center bg-white/[0.02] p-2 rounded border border-white/5"><span className="text-slate-500 text-[10px] uppercase flex items-center gap-1.5"><MapPin size={12}/> Location:</span><span className="text-amber-300 font-bold animate-pulse">{activeVector.location}</span></div>
            </div>
          </div>

          <div className="flex-1 min-h-[300px] lg:min-h-0 bg-[#050505] border border-white/10 rounded-xl flex flex-col shadow-[0_0_30px_rgba(0,0,0,0.8)] relative overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] pointer-events-none z-20 opacity-20" />
            <div className="p-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2 bg-black/60 z-30 shrink-0">
              <div className="flex items-center gap-2 text-cyan-400 font-mono text-[11px] font-bold tracking-[0.3em] uppercase"><Terminal size={14} className={isEngineRunning ? "animate-pulse" : ""} /> Uplink Telemetry</div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 sm:flex-none"><Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-cyan-500/50" /><input type="text" placeholder="Search logs..." value={logSearch} onChange={(e) => setLogSearch(e.target.value)} className="bg-white/5 border border-white/10 rounded px-2 pl-6 py-0.5 text-[9px] font-mono text-cyan-100 placeholder-slate-600 focus:outline-none w-full sm:w-32" /></div>
                <div className="flex gap-1.5 hidden sm:flex"><div className="w-2 h-2 rounded-full bg-rose-500" /><div className="w-2 h-2 rounded-full bg-amber-500" /><div className="w-2 h-2 rounded-full bg-emerald-500" /></div>
              </div>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 bg-[#0a0a0a] border-b border-white/5 z-30 shrink-0 overflow-x-auto scrollbar-none">
              {['all', 'info', 'success', 'warning', 'error'].map(lvl => (
                <button key={lvl} onClick={() => setLogFilter(lvl)} className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase transition-colors ${logFilter === lvl ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "text-slate-500 border-transparent hover:text-slate-300"}`}>{lvl}</button>
              ))}
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-thin scrollbar-thumb-white/10 z-10 bg-black text-emerald-500/80">
              {filteredLogs.length === 0 && logs.length > 0 && <div className="text-slate-600 italic">No logs match filters.</div>}
              {filteredLogs.map((log, i) => (
                <div key={i} className={`pl-3 border-l-2 py-0.5 pr-2 ${log.level === "error" ? "text-rose-400 border-rose-500 bg-rose-500/10" : log.level === "success" ? "text-cyan-400 border-cyan-500 bg-cyan-500/5" : log.level === "warning" ? "text-amber-400 border-amber-500 bg-amber-500/10" : "text-emerald-500 border-emerald-700"}`}>
                  <span className="text-slate-600 text-[9px] mr-2">[{log.timestamp?.split("T")[1]?.substring(0, 8) || "LIVE"}]</span>
                  {log.source && <span className="text-slate-400 text-[9px] mr-2 tracking-wider">[{log.source}]</span>}
                  <span className="tracking-wide">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </main>
      
      {/* Legal Footer */}
      <footer className="w-full py-3 px-6 mt-auto border-t border-slate-800 bg-slate-950/50 text-xs text-slate-500 flex items-center justify-between relative z-40">
        <p>© 2026 VSS Gowri Tech Online Private Limited. All rights reserved.</p>
        <div className="flex items-center space-x-4">
          <span onClick={() => setLegalModal({isOpen: true, type: 'privacy'})} className="hover:text-cyan-400 cursor-pointer transition-colors font-semibold">
            Privacy Policy (Centralized Cloud Sync Active)
          </span>
          <span>•</span>
          <span onClick={() => setLegalModal({isOpen: true, type: 'terms'})} className="hover:text-cyan-400 cursor-pointer transition-colors font-semibold">
            Terms of Service
          </span>
        </div>
      </footer>

      {/* Legal Text Modal Overlay */}
      {legalModal.isOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-cyan-500/30 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="font-mono text-cyan-400 font-bold uppercase tracking-widest text-sm">
                {legalModal.type === 'privacy' ? 'Privacy Policy & Data Disclosure' : 'End User License Agreement'}
              </h2>
              <button onClick={() => setLegalModal({isOpen: false, type: null})} className="text-slate-400 hover:text-rose-400 transition-colors p-1"><XCircle size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed scrollbar-thin scrollbar-thumb-white/10">
              {legalModal.type === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT}
            </div>
            <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
               <button onClick={() => setLegalModal({isOpen: false, type: null})} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-mono text-xs uppercase tracking-wider transition-colors">Acknowledge & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 4. MAIN APPLICATION ROUTER
// ==========================================
export default function App() {
  const [route, setRoute] = useState(window.location.hash || "#/");
  const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem("scrapeforge_admin_auth") === "true");

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (route === "#/admin") {
    if (!isAuthenticated) return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
    return <AdminMasterView onLogout={() => { localStorage.removeItem("scrapeforge_admin_auth"); setIsAuthenticated(false); window.location.hash = "#/"; }} />;
  }

  return <MainDashboard />;
}