import { db } from '../src/lib/database.js';
import { ApiKeyService } from '../src/services/apikey.service.js';

async function generateTestingKey() {
    console.log('--- Generating Demo Corp API Key ---');

    const existing = await db.query(`SELECT id FROM organizations WHERE slug = 'demo-corp'`);
    if (existing.rowCount === 0) {
        console.error("Demo Corp organization not found! Please run 'npx tsx scripts/seed_admin.ts' first.");
        process.exit(1);
    }

    const orgId = existing.rows[0].id;
    console.log(`Found Demo Corp orgId: ${orgId}`);

    // Check if one already exists
    const keys = await ApiKeyService.getKeysForOrg(orgId);
    if (keys.length > 0) {
        console.log(`\nFound existing API Key!`);
        console.log(`Key Name: ${keys[0].prefix}...`);
        console.log(`Rate Limit: ${keys[0].rate_limit_per_minute}/min`);
        console.log(`\nNote: The raw sk_sentinel_ secret was only shown upon initial creation. If you lost it, generate a new one.`);
    }

    // Always generate a fresh one for the tester
    const { rawKey, record } = await ApiKeyService.generateKey(orgId, 10000);

    console.log(`\n✅ Generated New API Key successfully!`);
    console.log(`ORG_API_KEY=${rawKey}\n`);

    process.exit(0);
}

generateTestingKey().catch(console.error);
