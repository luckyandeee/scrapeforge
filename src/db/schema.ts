import { db } from './sqlite';

export const createTables = () => {
    // 1. Enforce strict uniqueness on the normalized URL
    // 2. Add metadata columns (source, confidence_score, verification)
    db.exec(`
        CREATE TABLE IF NOT EXISTS businesses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            website TEXT,
            normalized_url TEXT UNIQUE,
            source TEXT NOT NULL,
            confidence_score INTEGER DEFAULT 0,
            
            -- Enriched Metadata
            address TEXT,
            phone TEXT,
            email TEXT,
            
            -- Taxonomy Mapping
            industry TEXT,
            main_category TEXT,
            sub_category TEXT,
            profession TEXT,
            ai_summary TEXT,
            
            -- Pipeline State
            status TEXT DEFAULT 'pending_verification',
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