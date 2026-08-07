import { queries, db } from '../db/sqlite';
import { processSingleBusinessPipeline } from '../workers/pipeline';

async function runTestPipeline() {
    console.log("🚀 Starting ScrapeForge Local Integration Test...");
    

    // 2. Seed test targets (Using highly reliable, public documentation sites as safe scraping examples)
    const testTargets = [
        { name: "Example Domain", website: "https://example.com" },
        { name: "HTTPBin Tester", website: "https://httpbin.org" }
    ];

    console.log("\n📥 Seeding test targets into local SQLite...");
    for (const target of testTargets) {
        const result = queries.insertBusiness.run(target.name, target.website);
        if (result.changes > 0) {
            console.log(`   + Added: ${target.name} (${target.website})`);
        } else {
            console.log(`   o Skiped (Already Exists): ${target.name}`);
        }
    }

    // 3. Fetch the pending targets we just inserted
    const pendingItems = queries.getPendingBusinesses.all(5) as any[];
    console.log(`\n🔍 Found ${pendingItems.length} pending targets ready for processing.`);

    if (pendingItems.length === 0) {
        console.log("❌ No pending items found. Exiting test.");
        return;
    }

    // 4. Run the pipeline sequentially to respect local CPU/VRAM limits
    for (const item of pendingItems) {
        console.log(`\n--------------------------------------------------`);
        console.log(`🧵 Processing Item [ID: ${item.id}] - ${item.name}`);
        console.log(`--------------------------------------------------`);
        
        try {
            await processSingleBusinessPipeline(item.id, item.website);
        } catch (error) {
            console.error(`❌ Pipeline failed for ${item.name}:`, error);
        }
    }

    // 5. Query the database to print out our final AI-enriched results
    console.log(`\n--------------------------------------------------`);
    console.log("📊 Final Database State Review:");
    console.log(`--------------------------------------------------`);
    const results = db.prepare("SELECT id, name, industry, phone, email, ai_summary FROM businesses").all();
    console.dir(results, { depth: null });

    console.log("\n🏁 Test execution complete!");
    process.exit(0);
}

// Execute the runner
runTestPipeline();