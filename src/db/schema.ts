import { db } from './sqlite';

export const createTables = () => {
    // SYNCED WITH SQLITE.TS TO PREVENT INSTALLATION CRASHES
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
            
            -- Enriched Metadata
            address TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            phone TEXT,
            email TEXT,
            executive_names TEXT,
            
            -- Taxonomy Mapping
            industry TEXT,
            main_category TEXT,
            sub_category TEXT,
            profession TEXT,
            ai_summary TEXT,
            social_links TEXT,
            
            -- Pipeline State
            status TEXT DEFAULT 'pending_verification',
            is_synced INTEGER DEFAULT 0,
            last_verified_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS job_queue (
            id TEXT PRIMARY KEY,
            target_url TEXT NOT NULL,
            job_type TEXT NOT NULL,
            status TEXT DEFAULT 'queued',
            retry_count INTEGER DEFAULT 0,
            error_log TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME
        );
    `);
};