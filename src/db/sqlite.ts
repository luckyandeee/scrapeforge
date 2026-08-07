import Database from 'better-sqlite3';
import path from 'path';
import { broadcast } from '../utils/logger'; 

const dbPath = path.resolve(process.cwd(), 'scrapeforge.db');

// 🚀 SURGICAL INJECTION: Added 8-second timeout to completely eliminate SQLITE_BUSY lock crashes.
export const db = new Database(dbPath, { timeout: 8000 });

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -64000');
db.pragma('busy_timeout = 8000'); 

// --- 4. 🚀 AUTHENTICATION TABLE ---
db.prepare(`
  CREATE TABLE IF NOT EXISTS auth_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )
`).run();

// 1. Create Core Tables (Unified & Optimized)
db.exec(`
  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_name TEXT NOT NULL, 
    name TEXT NOT NULL,
    website TEXT,
    normalized_url TEXT UNIQUE,
    source TEXT NOT NULL,
    target_location TEXT DEFAULT 'Unknown',
    confidence_score INTEGER DEFAULT 0,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT,
    phone TEXT,
    email TEXT,
    executive_names TEXT,
    industry TEXT,
    main_category TEXT,
    sub_category TEXT,
    profession TEXT,
    ai_summary TEXT,
    social_links TEXT,
    status TEXT DEFAULT 'pending_verification',
    is_synced INTEGER DEFAULT 0,
    last_verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS crawl_state (
    state_key TEXT PRIMARY KEY,
    last_page INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS engine_state (
    state_key TEXT PRIMARY KEY,
    last_page INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- 🚀 PERFORMANCE INJECTION: B-Tree Indexes for Lightning Fast Lookups
  CREATE INDEX IF NOT EXISTS idx_campaign ON businesses(campaign_name);
  CREATE INDEX IF NOT EXISTS idx_status ON businesses(status);
  CREATE INDEX IF NOT EXISTS idx_contact_phone ON businesses(phone);
  CREATE INDEX IF NOT EXISTS idx_contact_email ON businesses(email);
`);

// 2. Safe Auto-Upgrades for existing databases (Prevents crashes if columns exist)
try { db.exec(`ALTER TABLE businesses ADD COLUMN social_links TEXT;`); } catch (e) {}
try { db.exec(`ALTER TABLE businesses ADD COLUMN target_location TEXT DEFAULT 'Unknown';`); } catch (e) {}
try { db.exec(`ALTER TABLE crawl_state RENAME COLUMN engine_name TO state_key;`); } catch (e) {} 
try { db.exec(`ALTER TABLE businesses ADD COLUMN is_synced INTEGER DEFAULT 0;`); } catch (e) {}

// Internal Prepared Statement for the AI Update
const _rawUpdateBusinessAI = db.prepare(`
    UPDATE businesses
    SET 
        phone = CASE WHEN @phone != 'Not found' THEN @phone ELSE COALESCE(phone, @phone) END,
        email = CASE WHEN @email != 'Not found' THEN @email ELSE COALESCE(email, @email) END,
        address = CASE WHEN @address != 'Not found' THEN @address ELSE COALESCE(address, @address) END,
        city = CASE WHEN @city != 'Not found' THEN @city ELSE COALESCE(city, @city) END,
        state = CASE WHEN @state != 'Not found' THEN @state ELSE COALESCE(state, @state) END,
        country = CASE WHEN @country != 'Not found' THEN @country ELSE COALESCE(country, @country) END,
        executive_names = @executive_names, 
        industry = @industry, 
        main_category = @main_category, 
        sub_category = @sub_category, 
        profession = @profession, 
        ai_summary = @ai_summary, 
        social_links = CASE WHEN @social_links != 'Not found' THEN @social_links ELSE COALESCE(social_links, @social_links) END,
        status = @status, 
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
`);

// 3. Export Prepared Statements
export const queries = {

  // 🚀 AUTH QUERIES
  verifyUser: db.prepare(`SELECT * FROM auth_users WHERE username = ? AND password = ?`),

  getProcessedBusinesses: db.prepare(`
      SELECT * FROM businesses 
      WHERE campaign_name = ? AND status = 'processed'
      ORDER BY updated_at DESC
  `),
  
  insertBusiness: db.prepare(`
      INSERT INTO businesses (campaign_name, name, website, normalized_url, source, target_location)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(normalized_url) DO NOTHING
  `),
  
  checkIfExists: db.prepare(`SELECT 1 FROM businesses WHERE normalized_url = ?`),
  
  // 🚀 DYNAMIC AI DEDUPLICATION MIDDLEWARE
  updateBusinessAI: {
      run: db.transaction((data: any) => {
          let duplicate = null;
          
          // 1. Check for Phone Collision
          if (data.phone && data.phone !== "Not found" && data.phone !== "null") {
              duplicate = db.prepare(`SELECT * FROM businesses WHERE phone = ? AND id != ?`).get(data.phone, data.id) as any;
          }
          
          // 2. Check for Email Collision if no phone collision was found
          if (!duplicate && data.email && data.email !== "Not found" && data.email !== "null") {
              duplicate = db.prepare(`SELECT * FROM businesses WHERE email = ? AND id != ?`).get(data.email, data.id) as any;
          }

          // 3. Merge and Destroy Redundant Rows
          if (duplicate) {
              const sourceSet = new Set([
                  ...(duplicate.source || "").split(','),
                  ...(duplicate.social_links || "").split(','),
                  ...(data.social_links || "").split(',')
              ].map((s: string) => s.trim()).filter(Boolean).filter(s => s !== 'Not found'));
              
              const mergedSocials = Array.from(sourceSet).join(', ');

              db.prepare(`
                  UPDATE businesses 
                  SET social_links = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
              `).run(mergedSocials, duplicate.id);

              // Destroy the redundant row we just scraped to prevent clutter
              db.prepare(`DELETE FROM businesses WHERE id = ?`).run(data.id);
              
              try { broadcast("info", `Cross-Matrix Deduplication: Merged [${data.name}] into existing footprint.`, "Database"); } catch {}
              return { changes: 1 };
          }

          // No Collision -> Execute Normal Update
          return _rawUpdateBusinessAI.run(data);
      })
  },
  
  getCampaigns: db.prepare(`SELECT DISTINCT campaign_name FROM businesses ORDER BY campaign_name ASC`),
  
  deleteCampaign: db.transaction((campaignName: string) => {
      db.prepare(`DELETE FROM businesses WHERE campaign_name = ?`).run(campaignName);
      db.prepare(`DELETE FROM crawl_state WHERE state_key LIKE ?`).run(`${campaignName}_%`);
  }),
  
  getPendingBusinesses: db.prepare(`SELECT * FROM businesses WHERE status = 'pending_verification' LIMIT ?`),
  markProcessing: db.prepare(`UPDATE businesses SET status = 'processing' WHERE id = ?`),
  
  getStats: db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS processed,
             SUM(CASE WHEN status = 'contact_dry' THEN 1 ELSE 0 END) AS dry_reservoir 
      FROM businesses
  `),
  
  getEngineState: db.prepare(`SELECT last_page FROM crawl_state WHERE state_key = ?`),
  
  updateEngineState: db.prepare(`
      INSERT INTO crawl_state (state_key, last_page) VALUES (?, ?)
      ON CONFLICT(state_key) DO UPDATE SET last_page = excluded.last_page
  `),
  
  deleteBusiness: db.prepare(`DELETE FROM businesses WHERE id = ?`)
};

// 🚀 4. INTELLIGENT CROSS-SOURCE CROSS-PLATFORM CRAWL MERGER
export const upsertAndMergeBusiness = (data: {
  campaignName: string;
  name: string;
  website: string;
  normalizedUrl: string;
  source: string;
  location: string;
  phone?: string;
  email?: string;
  address?: string;
}) => {
  // 1. Cross-match against URL, Phone, or Email
  let existing = db.prepare(`SELECT * FROM businesses WHERE normalized_url = ?`).get(data.normalizedUrl) as any;

  if (!existing && data.phone && data.phone !== "Not found" && data.phone.trim() !== "") {
      existing = db.prepare(`SELECT * FROM businesses WHERE phone = ?`).get(data.phone) as any;
  }

  if (!existing && data.email && data.email !== "Not found" && data.email.trim() !== "") {
      existing = db.prepare(`SELECT * FROM businesses WHERE email = ?`).get(data.email) as any;
  }

  if (!existing) {
      return queries.insertBusiness.run(
          data.campaignName, data.name, data.website, data.normalizedUrl, data.source, data.location
      );
  }

  // 2. 🧠 HYBRID INTERACTION CROSS-MERGE DATA
  const updatedPhone = (!existing.phone || existing.phone === "Not found") ? (data.phone || "Not found") : existing.phone;
  const updatedEmail = (!existing.email || existing.email === "Not found") ? (data.email || "Not found") : existing.email;
  const updatedAddress = (!existing.address || existing.address === "Not found") ? (data.address || "Not found") : existing.address;
  
  const sourceSet = new Set(existing.source.split(',').map((s: string) => s.trim()));
  sourceSet.add(data.source);
  const updatedSources = Array.from(sourceSet).join(', ');

  db.prepare(`
      UPDATE businesses 
      SET phone = ?, email = ?, address = ?, source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
  `).run(updatedPhone, updatedEmail, updatedAddress, updatedSources, existing.id);
  
  const logMsg = `Profile vector merged across sources for: [${existing.name}]`;
  try {
      broadcast("info", logMsg, "Database");
  } catch {
      console.log(`[Database] [INFO] ${logMsg}`);
  }
  
  return { changes: 0 }; 
};



// Seed the default Admin credentials if the table is empty
const hasUser = db.prepare(`SELECT COUNT(*) as count FROM auth_users`).get() as any;
if (hasUser.count === 0) {
  // ⚠️ DEFAULT LOGIN: username: "admin", password: "adminpassword"
  db.prepare(`INSERT INTO auth_users (username, password) VALUES ('admin', 'adminpassword')`).run();
}

console.log('✅ Database storage layer online and schema verified.');