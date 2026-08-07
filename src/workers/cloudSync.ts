import { MongoClient } from 'mongodb';
import { db } from '../db/sqlite';
import { broadcast } from '../utils/logger';

// ⚠️ Ensure your MongoDB Atlas Network Access is set to allow 0.0.0.0/0
const MONGO_URI = "mongodb+srv://adsbylocalsuperman_db_user:KvYMFhFCDKM3b7yU@scrapeforge.slabx8z.mongodb.net/?retryWrites=true&w=majority&appName=ScrapeForge&family=4";
const DB_NAME = "scrapeforge_master";
const COLLECTION_NAME = "global_entities";

let isSyncing = false;

// 🚀 BULLETPROOF CLOUD SYNC WORKER (M0-Optimized)
export const startCloudSyncWorker = () => {
  broadcast("info", "Cloud Sync Worker initialized in isolated thread.", "System");

  setInterval(async () => {
    let client: MongoClient | null = null;
    try {
      // 1. Get 50 verified, unsynced leads from SQLite (Small batch for M0 limits)
      const unsynced = db.prepare(`
        SELECT * FROM businesses 
        WHERE status = 'processed' AND is_synced = 0 
        LIMIT 50
      `).all() as any[];

      if (unsynced.length === 0) return; // Nothing to sync

      // 2. Connect with strict timeouts so it doesn't hang the event loop
      client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 5000, // Give up quickly if offline
        connectTimeoutMS: 5000,
        socketTimeoutMS: 15000,
      });

      await client.connect();
      const col = client.db(DB_NAME).collection(COLLECTION_NAME);

      // 3. Prepare bulk upsert (Upsert prevents duplicates if sync is interrupted)
      const bulkOps = unsynced.map(biz => ({
        updateOne: {
          filter: { normalized_url: biz.normalized_url },
          update: { 
            $set: {
              ...biz,
              cloud_synced_at: new Date().toISOString()
            }
          },
          upsert: true
        }
      }));

      const result = await col.bulkWrite(bulkOps, { ordered: false });

      // 4. Mark as synced in local SQLite ONLY if cloud succeeded
      const markSynced = db.prepare(`UPDATE businesses SET is_synced = 1 WHERE id = ?`);
      const updateTx = db.transaction((businesses) => {
        for (const biz of businesses) markSynced.run(biz.id);
      });
      updateTx(unsynced);

      broadcast("success", `☁️ Cloud Matrix updated: Synced ${unsynced.length} entities to Master Archive.`, "System");

    } catch (error: any) {
      // 🚀 SILENT DEGRADATION: If M0 fails, we just log a warning and try again next loop
      if (!error.message?.includes('topology') && !error.message?.includes('closed')) {
    console.error("Cloud Sync Error:", error.message);
    broadcast("warning", `Cloud Sync failed: ${error.message}. Will retry in 15s.`, "System");
  }
    } finally {
      if (client) await client.close().catch(() => {});
    }
  }, 15000); // Check every 15 seconds
};